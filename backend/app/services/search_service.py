"""搜索 + 歌手只读页（v0.1.3）。

- 搜索走 SDK 通用 `request("/cloudsearch")`（比 /search 字段更全：带封面、
  privilege），失败时回退 SDK `search()`（/search），两者响应结构兼容 mapper；
- 短 TTL 缓存（key 含 kw+type+page）避免重复打上游；
- 滑动窗口限流：关键字过短（< 2 字）或请求过频时返回 429，防风控。
"""

import logging
import threading
import time
from typing import Any

from ..core.cache import cache
from ..core.config import settings
from ..core.errors import bad_request, not_found, rate_limited
from ..core.ncm_client import ncm_call
from ..models.search import ArtistBrief, ArtistDetail
from ..models.song import SongSummary
from .library_service import _ncm_get, _upstream_error
from .mappers import map_album_brief, map_artist_brief, map_playlist_brief, map_song

logger = logging.getLogger("csplayer.search")

# type 名 → (cloudsearch type 码, items 字段, total 字段)
SEARCH_TYPES: dict[str, tuple[int, str, str]] = {
    "song": (1, "songs", "songCount"),
    "album": (10, "albums", "albumCount"),
    "artist": (100, "artists", "artistCount"),
    "playlist": (1000, "playlists", "playlistCount"),
}

MAX_KEYWORD_LEN = 60  # 超长关键字直接拒绝（参数错误）
DEFAULT_LIMIT = 30
MAX_LIMIT = 50

SHORT_KEYWORD_LEN = 2  # 关键字长度 < 2 视为「过短」，风控更严
SHORT_KEYWORD_LIMIT = 6  # 过短关键字：窗口内最多次数
SEARCH_RATE_LIMIT = 30  # 常规搜索：窗口内最多次数
RATE_WINDOW_S = 60.0


class _SlidingWindowLimiter:
    """进程内滑动窗口限流：key → 命中时间戳列表。"""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window: float) -> bool:
        now = time.time()
        with self._lock:
            hits = [t for t in self._hits.get(key, []) if now - t < window]
            if len(hits) >= limit:
                self._hits[key] = hits
                return False
            hits.append(now)
            self._hits[key] = hits
            return True


_limiter = _SlidingWindowLimiter()


def _check_rate_limit(scope: str, kw: str) -> None:
    if len(kw) < SHORT_KEYWORD_LEN:
        allowed = _limiter.allow(f"kw-short:{scope}", SHORT_KEYWORD_LIMIT, RATE_WINDOW_S)
        limit = SHORT_KEYWORD_LIMIT
    else:
        allowed = _limiter.allow(f"kw:{scope}", SEARCH_RATE_LIMIT, RATE_WINDOW_S)
        limit = SEARCH_RATE_LIMIT
    if not allowed:
        raise rate_limited(f"搜索过于频繁（每分钟最多 {limit} 次），请稍候再试")


def _map_items(kind: str, raw_items: list) -> list[dict]:
    result: list[dict] = []
    for raw in raw_items:
        if not isinstance(raw, dict) or not raw.get("id"):
            continue
        if kind == "song":
            summary = map_song(raw)
            result.append(_apply_privilege(summary, raw).model_dump())
        elif kind == "album":
            result.append(map_album_brief(raw).model_dump())
        elif kind == "artist":
            result.append(map_artist_brief(raw).model_dump())
        else:  # playlist
            result.append(map_playlist_brief(raw).model_dump())
    return result


def _apply_privilege(summary: SongSummary, raw: dict) -> SongSummary:
    """cloudsearch 的 privilege 描述可播性；无权限时标记不可播。"""
    priv = raw.get("privilege")
    if not isinstance(priv, dict):
        return summary
    code = int(priv.get("code") or 0)
    st = int(priv.get("st") or 0)
    if code not in (0, 200) or st < 0:
        return summary.model_copy(update={"playable": False, "reason": "暂无版权或无权限"})
    return summary


async def _search_raw(
    cookie: dict, kw: str, upstream_type: int, limit: int, offset: int
) -> dict:
    """优先 cloudsearch（字段全），失败回退 SDK search()。返回 result 字典。"""
    try:
        resp = await ncm_call(
            "request",
            cookie=cookie,
            path="/cloudsearch",
            keywords=kw,
            type=upstream_type,
            limit=limit,
            offset=offset,
        )
        body = resp.body if isinstance(resp.body, dict) else {}
        if resp.status == 200 and isinstance(body.get("result"), dict):
            return body["result"]
        logger.warning(
            "cloudsearch 非预期响应 status=%s code=%s，回退 /search",
            resp.status,
            body.get("code"),
        )
    except Exception as exc:  # noqa: BLE001 回退旧接口
        logger.warning("cloudsearch 调用失败，回退 /search: %s", exc)

    resp = await ncm_call(
        "search",
        cookie=cookie,
        keywords=kw,
        type=upstream_type,
        limit=limit,
        offset=offset,
    )
    if resp.status != 200:
        raise _upstream_error(resp, "搜索失败")
    body = resp.body if isinstance(resp.body, dict) else {}
    result = body.get("result")
    return result if isinstance(result, dict) else {}


async def search(
    cookie: dict,
    keyword: str,
    *,
    search_type: str = "song",
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
    scope: str = "anon",
) -> dict:
    kw = (keyword or "").strip()
    if not kw:
        raise bad_request("缺少搜索关键字")
    if len(kw) > MAX_KEYWORD_LEN:
        raise bad_request(f"搜索关键字过长（最多 {MAX_KEYWORD_LEN} 字）")
    if search_type not in SEARCH_TYPES:
        raise bad_request("不支持的搜索类型")

    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    offset = max(0, int(offset or 0))
    _check_rate_limit(str(scope), kw)

    upstream_type, items_field, total_field = SEARCH_TYPES[search_type]
    key = f"search:{kw}:{search_type}:{limit}:{offset}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    result = await _search_raw(cookie, kw, upstream_type, limit, offset)
    raw_items = result.get(items_field) or []
    items = _map_items(search_type, raw_items if isinstance(raw_items, list) else [])
    total = int(result.get(total_field) or 0)
    has_more = (
        bool(result.get("hasMore"))
        if isinstance(result.get("hasMore"), bool)
        else offset + len(items) < total
    )
    payload = {"items": items, "hasMore": has_more, "total": total}
    cache.set(key, payload, settings.cache_ttl["search"])
    return payload


async def artist_detail(cookie: dict, artist_id: int) -> ArtistDetail:
    key = f"artist:{artist_id}:detail"
    cached = cache.get(key)
    if cached:
        return ArtistDetail(**cached)

    resp = await _ncm_get("artists", cookie=cookie, id=artist_id)
    body = resp.body if isinstance(resp.body, dict) else {}
    if resp.status == 404 or body.get("code") == 404:
        raise not_found("歌手不存在")
    if resp.status != 200:
        raise _upstream_error(resp, f"获取歌手详情失败 id={artist_id}")
    artist = body.get("artist") or {}
    if not artist or not artist.get("id"):
        raise not_found("歌手不存在")

    brief: ArtistBrief = map_artist_brief(artist)
    hot_songs = [
        _apply_privilege(map_song(s), s)
        for s in body.get("hotSongs") or []
        if isinstance(s, dict) and s.get("id")
    ]

    detail = ArtistDetail(
        id=brief.id,
        name=brief.name,
        avatarUrl=brief.avatarUrl,
        alias=brief.alias,
        briefDesc=str(artist.get("briefDesc") or ""),
        hotSongs=hot_songs,
    )
    cache.set(key, detail.model_dump(), settings.cache_ttl["artist_detail"])
    return detail


async def artist_albums(
    cookie: dict, artist_id: int, offset: int = 0, limit: int = 30
) -> dict:
    """歌手专辑分页（歌手页每页 30 张 + 「加载更多」）。"""
    offset = max(0, int(offset or 0))
    limit = max(1, min(int(limit or 30), 50))
    key = f"artist:{artist_id}:albums:{limit}:{offset}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    resp = await _ncm_get(
        "artist_album", cookie=cookie, id=artist_id, limit=limit, offset=offset
    )
    body = resp.body if isinstance(resp.body, dict) else {}
    if resp.status == 404 or body.get("code") == 404:
        raise not_found("歌手不存在")
    if resp.status != 200:
        raise _upstream_error(resp, f"获取歌手专辑失败 id={artist_id} offset={offset}")

    items = [
        map_album_brief(a).model_dump()
        for a in body.get("hotAlbums") or []
        if isinstance(a, dict) and a.get("id")
    ]
    artist = body.get("artist") or {}
    total = int(artist.get("albumSize") or 0) or offset + len(items)
    more = body.get("more")
    has_more = (
        bool(more) if isinstance(more, bool) else offset + len(items) < total
    )
    payload = {"items": items, "hasMore": has_more, "total": total}
    cache.set(key, payload, settings.cache_ttl["artist_detail"])
    return payload
