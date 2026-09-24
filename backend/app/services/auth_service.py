import asyncio
import re
import threading
import time

from ..core.cache import cache
from ..core.config import settings
from ..core.errors import bad_gateway, rate_limited, unauthorized
from ..core.ncm_client import ncm_call
from ..core.session import COOKIE_ATTRS, parse_cookie_str, sanitize_cookie, sessions
from ..models.user import UserProfile
from .mappers import map_user_profile

# unikey 短缓存 + 上游 qr/key 最小间隔，避免网易云 406 风控
_QR_KEY_TTL = 25.0
_QR_KEY_MIN_INTERVAL = 4.0
_qr_lock = threading.Lock()
_qr_io_lock = asyncio.Lock()
_qr_cached: dict = {"unikey": "", "expires": 0.0, "qrimg": "", "qrurl": ""}
_qr_last_upstream = 0.0


def _ncm_status(resp, body: dict) -> int:
    return int(body.get("code") or resp.status or 0)


def _ensure_not_busy(resp, body: dict) -> None:
    code = _ncm_status(resp, body)
    if code == 406 or resp.status == 406 or "频繁" in str(body.get("msg") or body.get("message") or ""):
        raise rate_limited("操作频繁，请稍候再试")


def _extract_cookies(resp) -> dict[str, str]:
    cookie: dict[str, str] = {}
    body = resp.body or {}
    raw = body.get("cookie")
    if isinstance(raw, str) and raw:
        cookie.update(parse_cookie_str(raw))
    headers = resp.headers or {}
    set_cookie = headers.get("Set-Cookie") or headers.get("set-cookie") or ""
    if isinstance(set_cookie, list):
        chunks = set_cookie
    else:
        chunks = [c for c in re.split(r",(?=[^;]+=)", set_cookie) if c]
    for chunk in chunks:
        first = str(chunk).split(";")[0].strip()
        if "=" in first:
            k, v = first.split("=", 1)
            k = k.strip()
            if k.lower() in COOKIE_ATTRS:
                continue
            cookie[k] = v.strip()
    return cookie


async def qr_key() -> dict:
    global _qr_last_upstream

    now = time.time()
    with _qr_lock:
        if _qr_cached["unikey"] and now < _qr_cached["expires"]:
            return {"unikey": _qr_cached["unikey"]}

    # 并发请求合并到同一次上游拉取，避免 StrictMode / 双挂载撞 4s 限流
    async with _qr_io_lock:
        now = time.time()
        with _qr_lock:
            if _qr_cached["unikey"] and now < _qr_cached["expires"]:
                return {"unikey": _qr_cached["unikey"]}
            if now - _qr_last_upstream < _QR_KEY_MIN_INTERVAL:
                raise rate_limited("操作频繁，请稍候再试")
            _qr_last_upstream = now

        resp = await ncm_call("login_qr_key")
        body = resp.body or {}
        _ensure_not_busy(resp, body)
        unikey = (body.get("data") or {}).get("unikey") or body.get("unikey")
        if resp.status != 200 or not unikey:
            raise bad_gateway("获取二维码 key 失败")
        with _qr_lock:
            _qr_cached["unikey"] = unikey
            _qr_cached["expires"] = time.time() + _QR_KEY_TTL
            _qr_cached["qrimg"] = ""
            _qr_cached["qrurl"] = ""
        return {"unikey": unikey}


async def qr_create(unikey: str) -> dict:
    # 复用同一 unikey 的已渲染二维码，减少上游 create
    with _qr_lock:
        if _qr_cached["unikey"] == unikey and _qr_cached["qrimg"]:
            return {
                "unikey": unikey,
                "qrimg": _qr_cached["qrimg"],
                "qrurl": _qr_cached["qrurl"],
            }

    # SDK 的 qrimg 参数会导致 route did not finish；改用 qrurl 本地渲染二维码
    resp = await ncm_call("login_qr_create", key=unikey)
    body = resp.body or {}
    _ensure_not_busy(resp, body)
    data = body.get("data") or body
    if resp.status != 200:
        raise bad_gateway("生成二维码失败")
    qrurl = data.get("qrurl") or ""
    qrimg = data.get("qrimg") or ""
    if not qrimg and qrurl:
        qrimg = _render_qr_base64(qrurl)
    if not qrimg:
        raise bad_gateway("生成二维码失败")
    with _qr_lock:
        if _qr_cached["unikey"] == unikey:
            _qr_cached["qrimg"] = qrimg
            _qr_cached["qrurl"] = qrurl
    return {"unikey": unikey, "qrimg": qrimg, "qrurl": qrurl}


def _render_qr_base64(text: str) -> str:
    import base64
    import io

    import qrcode

    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


async def qr_check(unikey: str) -> dict:
    resp = await ncm_call("login_qr_check", key=unikey)
    body = resp.body or {}
    code = _ncm_status(resp, body)

    if code == 406 or "频繁" in str(body.get("msg") or body.get("message") or ""):
        return {"status": "rate_limited"}

    # 风控 502 时按 SDK 说明改用 noCookie=true 重试
    if code == 502 or (not code and resp.status >= 500):
        resp = await ncm_call("login_qr_check", key=unikey, noCookie=True)
        body = resp.body or {}
        code = _ncm_status(resp, body)

    # 800 expired | 801 waiting | 802 scanned | 803 success
    if code == 800:
        return {"status": "expired"}
    if code == 801:
        return {"status": "waiting"}
    if code == 802:
        return {"status": "scanned"}
    if code != 803:
        if code == 406:
            return {"status": "rate_limited"}
        raise bad_gateway(f"二维码检查失败 code={code}")

    cookie = _extract_cookies(resp)
    if not cookie:
        data = body.get("data") or {}
        raw = data.get("cookie") or body.get("cookie")
        if isinstance(raw, str):
            cookie = parse_cookie_str(raw)
        elif isinstance(raw, dict):
            cookie = sanitize_cookie(raw)
    cookie = sanitize_cookie(cookie)
    if not cookie:
        raise bad_gateway("登录成功但未获取到 Cookie")

    profile = await _fetch_profile(cookie)
    sid = sessions.create(cookie, profile.userId)
    return {"status": "success", "cookie": cookie, "user": profile, "sid": sid}


async def _fetch_profile(cookie: dict) -> UserProfile:
    resp = await ncm_call("user_account", cookie=cookie)
    body = resp.body or {}
    if resp.status != 200 or int(body.get("code") or 0) not in (200, 0):
        raise unauthorized("获取账号信息失败，请重新登录")
    profile = body.get("profile") or body.get("data") or {}
    if not profile:
        raise unauthorized("账号信息为空")
    user = map_user_profile(body, profile if isinstance(profile, dict) else {})
    if not user.userId:
        raise unauthorized("无法解析用户 ID")
    return user


async def get_me(cookie: dict) -> UserProfile:
    key = f"user_profile:{_cookie_key(cookie)}"
    cached = cache.get(key)
    if cached:
        return UserProfile(**cached)
    user = await _fetch_profile(cookie)
    cache.set(key, user.model_dump(), settings.cache_ttl["user_profile"])
    return user


def _cookie_key(cookie: dict) -> str:
    return str(cookie.get("MUSIC_U") or "anon")[:24]


async def restore(cred) -> dict:
    """用浏览器保存的网易云凭证重建会话（纯内存，不落盘）。"""
    music_u = cred.get("MUSIC_U") if isinstance(cred, dict) else None
    if not isinstance(music_u, str) or not music_u:
        raise unauthorized("凭证无效，请重新扫码登录")
    cookie = sanitize_cookie(cred)
    if not cookie.get("MUSIC_U"):
        raise unauthorized("凭证无效，请重新扫码登录")
    profile = await _fetch_profile(cookie)
    sid = sessions.create(cookie, profile.userId)
    return {"user": profile, "sid": sid}


async def logout(sid: str, cookie: dict) -> dict:
    try:
        await ncm_call("logout", cookie=cookie)
    except Exception:
        pass
    sessions.delete(sid)
    cache.invalidate_prefix("user_profile")
    cache.invalidate_prefix("user:")
    return {}
