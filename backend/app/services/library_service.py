import asyncio
import logging
from typing import Any

from ..core.cache import cache
from ..core.config import settings
from ..core.errors import bad_gateway, not_found, unauthorized
from ..core.ncm_client import ncm_call
from ..models.album import AlbumDetail
from ..models.playlist import PlaylistBrief, PlaylistDetail
from ..models.song import LikeResult, LikedSongs, RecordItem, SongSummary
from .mappers import (
    map_album_brief,
    map_album_detail,
    map_playlist_brief,
    map_playlist_detail,
    map_song,
)

logger = logging.getLogger("csplayer.library")

# 上游补拉单页条数 = 对外默认批（与前端 api.PAGE_SIZE 对齐，均为 40）：
# 单页越大 SDK/QuickJS 大响应崩溃风险越高，越小则上游往返越多
PAGE = 40
# 分批拉取安全上限（防上游数据异常导致无限拉取）
MAX_ITEMS = 2000


def _body_code(resp) -> Any:
    body = resp.body
    return body.get("code") if isinstance(body, dict) else None


def _upstream_error(resp, what: str) -> Exception:
    """把上游失败映射为用户可读异常；技术细节只进服务端日志。"""
    status = resp.status
    code = _body_code(resp)
    logger.error("%s: status=%s body.code=%s", what, status, code)
    if status == 301 or code == 301:
        return unauthorized("登录已失效，请重新登录")
    shown = code if code not in (None, 0, 200) else status
    return bad_gateway(f"网易云接口暂时不可用（错误码 {shown}），请稍后重试")


async def _ncm_get(fn_name: str, **kwargs: Any):
    """只读 SDK 拉取：非 200 时重试一次，掩盖偶发崩溃/风控。
    写操作（like / playlist_tracks）禁止使用，避免重复执行。"""
    resp = await ncm_call(fn_name, **kwargs)
    if resp.status == 200:
        return resp
    logger.warning(
        "SDK %s 返回非 200: status=%s body.code=%s，重试一次",
        fn_name,
        resp.status,
        _body_code(resp),
    )
    resp = await ncm_call(fn_name, **kwargs)
    return resp


async def user_playlists(cookie: dict, user_id: int) -> dict:
    key = f"user:{user_id}:playlists"
    cached = cache.get(key)
    if cached:
        return cached

    created: list[PlaylistBrief] = []
    subscribed: list[PlaylistBrief] = []
    for raw in await _user_playlists_raw(cookie, user_id):
        brief = map_playlist_brief(raw, user_id)
        if brief.subscribed:
            subscribed.append(brief)
        else:
            created.append(brief)
    # 我喜欢的音乐置顶：名称约定 + creator 是自己且通常为第一项
    created.sort(key=lambda p: (0 if "喜欢" in p.name else 1, p.id))
    result = {
        "created": [p.model_dump() for p in created],
        "subscribed": [p.model_dump() for p in subscribed],
    }
    cache.set(key, result, settings.cache_ttl["user_playlists"])
    return result


async def _user_playlists_raw(cookie: dict, user_id: int) -> list[dict]:
    """用户歌单原始列表（含 trackCount 等原始字段）。

    `user_playlists` 与 `_liked_playlist`（我喜欢）共用同一份上游缓存（S2-1 减往返）：
    两个入口都只打一次 user_playlist，另一方直接命中内存。
    """
    key = f"user:{user_id}:playlists:raw"
    cached = cache.get(key)
    if cached is not None:
        return cached

    resp = await _ncm_get(
        "user_playlist", cookie=cookie, uid=user_id, limit=100, offset=0
    )
    body = resp.body or {}
    if resp.status != 200:
        raise _upstream_error(resp, f"获取用户歌单失败 uid={user_id}")
    items = [p for p in (body.get("playlist") or []) if isinstance(p, dict)]
    cache.set(key, items, settings.cache_ttl["user_playlists"])
    return items


async def user_albums(
    cookie: dict, user_id: int, offset: int = 0, limit: int | None = PAGE
) -> dict:
    """收藏专辑分页（按需补拉，批大小 PAGE）。

    只补拉到能覆盖 offset+limit 的上游页，冷路径不再一次拉全量
    （旧行为：冷路径连打 ~10 次 album_sublist）；已拉部分入内存缓存，
    翻页 / 首页取总数（offset=0&limit=1）均命中缓存。limit=None 返回全量。
    """
    start = max(0, int(offset or 0))
    size = None if limit is None else max(1, min(int(limit), 200))
    need = MAX_ITEMS if size is None else start + size
    state = await _albums_state(cookie, user_id, need)

    items_all = state["items"]
    items = items_all[start:] if size is None else items_all[start : start + size]
    total = max(int(state.get("total") or 0), len(items_all))
    has_more = (not state["complete"]) or start + len(items) < total
    return {"items": items, "hasMore": has_more, "total": total}


def _albums_key(user_id: int) -> str:
    return f"user:{user_id}:albums:pages"


async def _albums_state(cookie: dict, user_id: int, need: int) -> dict:
    """收藏专辑增量缓存：{items, total, complete}，逐批补拉到覆盖 need 条。"""
    key = _albums_key(user_id)
    state = cache.get(key)
    if not isinstance(state, dict):
        state = {"items": [], "total": 0, "complete": False}

    need = max(0, min(int(need), MAX_ITEMS))
    while len(state["items"]) < need and not state["complete"]:
        page_offset = len(state["items"])
        resp = await _ncm_get(
            "album_sublist", cookie=cookie, limit=PAGE, offset=page_offset
        )
        body = resp.body if isinstance(resp.body, dict) else {}
        code = int(body.get("code") or resp.status or 0)
        if resp.status != 200 or code not in (200, 0):
            raise _upstream_error(resp, "获取收藏专辑失败")
        data = body.get("data")
        if not isinstance(data, list):
            data = body.get("album")
        if not isinstance(data, list):
            data = body.get("albums") or []
        if not isinstance(data, list):
            data = []
        page = [
            map_album_brief(raw).model_dump() for raw in data if isinstance(raw, dict)
        ]
        state["items"].extend(page)

        # 上游总数（album_sublist 下发 count/totalCount）：首页计数不必拉全量
        total = body.get("totalCount")
        if not isinstance(total, int):
            total = body.get("count")
        if isinstance(total, int) and total > len(state["items"]):
            state["total"] = total
        more = body.get("hasMore")
        if not isinstance(more, bool):
            more = body.get("more")
        if isinstance(more, bool):
            state["complete"] = not more
        elif len(page) < PAGE:
            state["complete"] = True
        if not page:
            state["complete"] = True
        if state["complete"]:
            state["total"] = len(state["items"])
        cache.set(key, state, settings.cache_ttl["album_sublist"])
    return state


async def playlist_detail(cookie: dict, playlist_id: int, user_id: int | None) -> PlaylistDetail:
    key = f"playlist:{playlist_id}:detail"
    cached = cache.get(key)
    if cached:
        return PlaylistDetail(**cached)

    meta_resp = await _ncm_get("playlist_detail", cookie=cookie, id=playlist_id)
    meta_body = meta_resp.body or {}
    if meta_resp.status != 200:
        raise _upstream_error(meta_resp, f"获取歌单详情失败 id={playlist_id}")
    meta = meta_body.get("playlist") or {}
    if not meta or not meta.get("id"):
        raise not_found("歌单不存在或无权访问")

    # meta 自带 trackCount → 分页可一次编排（S2-1）
    tracks_raw = await _playlist_tracks(
        cookie, playlist_id, hint_total=int(meta.get("trackCount") or 0)
    )
    detail = map_playlist_detail(meta, tracks_raw, user_id)
    cache.set(key, detail.model_dump(), settings.cache_ttl["playlist_detail"])
    return detail


async def _fetch_track_page(
    cookie: dict, playlist_id: int, offset: int, limit: int
) -> list[dict]:
    resp = await _ncm_get(
        "playlist_track_all",
        cookie=cookie,
        id=playlist_id,
        limit=limit,
        offset=offset,
    )
    body = resp.body or {}
    if resp.status != 200:
        raise _upstream_error(
            resp, f"获取歌单歌曲失败 id={playlist_id} offset={offset}"
        )
    songs = body.get("songs") or []
    return [s for s in songs if isinstance(s, dict)]


async def _playlist_tracks(
    cookie: dict, playlist_id: int, hint_total: int | None = None
) -> list[dict]:
    """歌单全部曲目（分页拉取，带内存缓存）。

    S2-1：调用方可传 hint_total（来自歌单 meta / trackCount），则全部分页
    用 asyncio.gather 一次编排（后续 SDK 并发化后可直接受益），不再逐页串行
    等待；trackCount 滞后时靠「末页满页续拉」兜底。缺 hint 时退化为原串行循环。
    单页 PAGE 条：单页响应越小，SDK/QuickJS 大响应崩溃概率越低。
    """
    key = f"playlist:{playlist_id}:tracks"
    cached = cache.get(key)
    if cached:
        return cached

    limit = PAGE
    max_offset = MAX_ITEMS
    all_tracks: list[dict] = []

    if hint_total and hint_total > 0:
        pages = min(-(-int(hint_total) // limit), max_offset // limit)
        page_lists = await asyncio.gather(
            *[
                _fetch_track_page(cookie, playlist_id, i * limit, limit)
                for i in range(pages)
            ]
        )
        for page in page_lists:
            all_tracks.extend(page)
        # trackCount 可能滞后（刚红心/取消）：末页满页则继续顺序补页
        last_len = len(page_lists[-1]) if page_lists else 0
        offset = pages * limit
        while last_len >= limit and offset <= max_offset:
            page = await _fetch_track_page(cookie, playlist_id, offset, limit)
            all_tracks.extend(page)
            last_len = len(page)
            offset += limit
    else:
        offset = 0
        while True:
            page = await _fetch_track_page(cookie, playlist_id, offset, limit)
            all_tracks.extend(page)
            if len(page) < limit:
                break
            offset += limit
            if offset > max_offset:
                break

    cache.set(key, all_tracks, settings.cache_ttl["playlist_detail"])
    return all_tracks


async def album_detail(cookie: dict, album_id: int) -> AlbumDetail:
    key = f"album:{album_id}:detail"
    cached = cache.get(key)
    if cached:
        return AlbumDetail(**cached)

    resp = await _ncm_get("album", cookie=cookie, id=album_id)
    body = resp.body or {}
    if resp.status != 200:
        raise _upstream_error(resp, f"获取专辑失败 id={album_id}")
    album = body.get("album") or {}
    songs = body.get("songs") or []
    if not album or not album.get("id"):
        raise not_found("专辑不存在")

    detail = map_album_detail(album, [s for s in songs if isinstance(s, dict)])
    cache.set(key, detail.model_dump(), settings.cache_ttl["album_detail"])
    return detail


def _is_liked_playlist(raw: dict) -> bool:
    if raw.get("specialType") == 5:
        return True
    name = str(raw.get("name") or "").strip()
    return name == "我喜欢的音乐" or name.endswith("喜欢的音乐")


async def _liked_playlist(cookie: dict, user_id: int) -> dict:
    """「我喜欢的音乐」歌单项（id + trackCount）。

    直接复用 `_user_playlists_raw` 的同一份上游缓存（S2-1 减往返）；
    trackCount 仅作分页编排 hint（_playlist_tracks 有兜底），故 like 变更后
    不失效本缓存，避免每次红心后多打一次 user_playlist。pid 对账号不可变，
    用长 TTL（liked_playlist）消除 /like 重复冷路径上的 user_playlist 往返。
    """
    key = f"user:{user_id}:liked_playlist"
    cached = cache.get(key)
    if cached is not None:
        return cached

    for raw in await _user_playlists_raw(cookie, user_id):
        if isinstance(raw, dict) and _is_liked_playlist(raw):
            pid = int(raw.get("id") or 0)
            if pid:
                info = {"id": pid, "trackCount": int(raw.get("trackCount") or 0)}
                cache.set(key, info, settings.cache_ttl["liked_playlist"])
                return info
    raise not_found("未找到「我喜欢的音乐」歌单")


async def liked_playlist_id(cookie: dict, user_id: int) -> int:
    return int((await _liked_playlist(cookie, user_id))["id"])


async def user_liked_ids(cookie: dict, user_id: int) -> list[int]:
    key = f"user:{user_id}:liked_ids"
    cached = cache.get(key)
    if cached is not None:
        return cached

    # 单一数据源（S2-1）：likes 已完整拉取时直接派生 ids（前端也从 tracks 派生），
    # 省一次上游 likelist 往返；likes 分批未拉全时回 likelist（ids 需全量）
    likes_state = cache.get(f"user:{user_id}:likes:pages")
    if isinstance(likes_state, dict) and likes_state.get("complete"):
        derived = [
            int(t.get("id") or 0) for t in likes_state.get("tracks") or [] if t.get("id")
        ]
        cache.set(key, derived, settings.cache_ttl["user_liked_ids"])
        return derived

    resp = await _ncm_get("likelist", cookie=cookie, uid=user_id)
    body = resp.body or {}
    if resp.status != 200:
        raise _upstream_error(resp, f"获取喜欢列表失败 uid={user_id}")
    ids = body.get("ids") or []
    result = [int(i) for i in ids if i is not None]
    cache.set(key, result, settings.cache_ttl["user_liked_ids"])
    return result


async def user_likes(
    cookie: dict, user_id: int, offset: int = 0, limit: int | None = PAGE
) -> LikedSongs:
    """「我喜欢的音乐」分页（按需补拉，批大小 PAGE）。

    滚动到底由前端续拉下一批；冷路径不再一次拉全量（旧行为：冷路径
    用 _playlist_tracks 一次编排全部分页）。limit=None 返回全量。
    """
    start = max(0, int(offset or 0))
    size = None if limit is None else max(1, min(int(limit), 200))
    need = MAX_ITEMS if size is None else start + size
    state = await _likes_state(cookie, user_id, need)

    tracks_raw = state["tracks"]
    items = tracks_raw[start:] if size is None else tracks_raw[start : start + size]
    total = max(int(state.get("total") or 0), len(tracks_raw))
    has_more = (not state["complete"]) or start + len(items) < total
    return LikedSongs(
        playlistId=int(state["playlistId"]),
        tracks=[SongSummary(**t) for t in items],
        total=total,
        hasMore=has_more,
    )


def _likes_key(user_id: int) -> str:
    return f"user:{user_id}:likes:pages"


async def _likes_state(cookie: dict, user_id: int, need: int) -> dict:
    """「我喜欢」增量缓存：{playlistId, tracks, total, complete}，逐批补拉到覆盖 need 条。"""
    key = _likes_key(user_id)
    state = cache.get(key)
    if not isinstance(state, dict):
        info = await _liked_playlist(cookie, user_id)
        state = {
            "playlistId": int(info["id"]),
            "tracks": [],
            "total": int(info.get("trackCount") or 0),
            "complete": False,
        }

    pid = int(state["playlistId"])
    need = max(0, min(int(need), MAX_ITEMS))
    while len(state["tracks"]) < need and not state["complete"]:
        # 缺口多页时一次编排全部缺口页（S2-1，与 _playlist_tracks 一致）：
        # 目前 SDK 串行实际仍按序执行，SDK 并发化后可直接受益；
        # 单页网格偏移按原始条数推进，去重/丢弃由 map 过滤自理
        base = len(state["tracks"])
        pages = max(1, -(-(need - base) // PAGE))
        fetched = await asyncio.gather(
            *[
                _fetch_track_page(cookie, pid, base + i * PAGE, PAGE)
                for i in range(pages)
            ]
        )
        for page in fetched:
            state["tracks"].extend(
                map_song(t).model_dump()
                for t in page
                if isinstance(t, dict) and t.get("id")
            )
        if len(fetched[-1]) < PAGE:
            state["complete"] = True
            # 拉全后自校正（trackCount hint 可能滞后）
            state["total"] = len(state["tracks"])
        cache.set(key, state, settings.cache_ttl["user_likes"])
    return state


async def user_record_rank(
    cookie: dict, user_id: int, type: str = "all", limit: int = 50
) -> list[RecordItem]:
    """听歌排行榜。type=all → allData；type=week → weekData。

    注意：真正的「最近播放」需 /record/recent/song，当前 SDK 登录态会原生崩溃，
    详见 docs/archived/DEBUG.md。本接口仅使用稳定的 user_record。
    """
    limit = max(1, min(int(limit or 50), 100))
    ncm_type = 1 if type == "week" else 0
    key = f"user:{user_id}:record:{ncm_type}:{limit}"
    cached = cache.get(key)
    if cached is not None:
        return [RecordItem(**s) for s in cached]

    resp = await _ncm_get("user_record", cookie=cookie, uid=user_id, type=ncm_type)
    body = resp.body or {}
    if resp.status != 200:
        raise _upstream_error(
            resp, f"获取听歌排行失败 uid={user_id} type={ncm_type}"
        )

    if ncm_type == 1:
        raw_list = body.get("weekData") or body.get("allData") or []
    else:
        raw_list = body.get("allData") or body.get("weekData") or []

    items: list[RecordItem] = []
    for entry in raw_list:
        if not isinstance(entry, dict):
            continue
        raw = entry.get("song") or entry.get("data") or None
        if not isinstance(raw, dict) or not raw.get("id"):
            continue
        items.append(
            RecordItem(
                song=map_song(raw),
                playCount=int(entry.get("playCount") or 0),
                score=int(entry.get("score") or 0),
            )
        )
        if len(items) >= limit:
            break

    cache.set(key, [i.model_dump() for i in items], settings.cache_ttl["user_recent"])
    return items


async def _invalidate_like_cache(
    cookie: dict, user_id: int, song_id: int | None = None
) -> None:
    cache.invalidate(f"user:{user_id}:likes")
    cache.invalidate(f"user:{user_id}:likes:pages")
    cache.invalidate(f"user:{user_id}:liked_ids")
    cache.invalidate(f"user:{user_id}:playlists")
    cache.invalidate(f"user:{user_id}:playlists:raw")
    if song_id is not None:
        cache.invalidate(f"song:{song_id}:detail")
    try:
        pid = await liked_playlist_id(cookie, user_id)
        cache.invalidate(f"playlist:{pid}:tracks")
        cache.invalidate(f"playlist:{pid}:detail")
    except Exception:
        pass


async def toggle_like(cookie: dict, user_id: int, song_id: int, like: bool) -> LikeResult:
    resp = await ncm_call("like", cookie=cookie, id=song_id, like=like)
    body: dict[str, Any] = resp.body or {}
    code = int(body.get("code") or resp.status or 0)

    if resp.status != 200 or code not in (200, 0):
        # 回退：对「我喜欢的音乐」歌单增删曲
        pid = await liked_playlist_id(cookie, user_id)
        op = "add" if like else "del"
        resp2 = await ncm_call(
            "playlist_tracks", cookie=cookie, op=op, pid=pid, tracks=str(song_id)
        )
        body2 = resp2.body or {}
        code2 = int(body2.get("code") or resp2.status or 0)
        if resp2.status != 200 or code2 not in (200, 0):
            raise _upstream_error(resp2, f"更新喜欢状态失败 id={song_id}")

    await _invalidate_like_cache(cookie, user_id, song_id)
    return LikeResult(id=song_id, liked=like)
