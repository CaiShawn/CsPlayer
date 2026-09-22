from ..core.cache import cache
from ..core.config import settings
from ..core.errors import bad_gateway, not_found
from ..core.ncm_client import ncm_call
from ..models.album import AlbumBrief, AlbumDetail
from ..models.playlist import PlaylistBrief, PlaylistDetail
from .mappers import (
    map_album_brief,
    map_album_detail,
    map_playlist_brief,
    map_playlist_detail,
)


async def user_playlists(cookie: dict, user_id: int) -> dict:
    key = f"user:{user_id}:playlists"
    cached = cache.get(key)
    if cached:
        return cached

    resp = await ncm_call(
        "user_playlist", cookie=cookie, uid=user_id, limit=100, offset=0
    )
    body = resp.body or {}
    if resp.status != 200:
        raise bad_gateway("获取用户歌单失败")
    playlist = body.get("playlist") or []
    created: list[PlaylistBrief] = []
    subscribed: list[PlaylistBrief] = []
    for raw in playlist:
        if not isinstance(raw, dict):
            continue
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


async def user_albums(cookie: dict, user_id: int) -> list[AlbumBrief]:
    key = f"user:{user_id}:albums"
    cached = cache.get(key)
    if cached:
        return cached

    all_items: list[AlbumBrief] = []
    offset = 0
    while True:
        resp = await ncm_call(
            "album_sublist", cookie=cookie, limit=50, offset=offset
        )
        body = resp.body or {}
        if resp.status != 200:
            raise bad_gateway("获取收藏专辑失败")
        data = body.get("data") or body.get("albums") or []
        for raw in data:
            if isinstance(raw, dict):
                all_items.append(map_album_brief(raw))
        if len(data) < 50:
            break
        offset += 50
        if offset > 500:
            break

    result = [a.model_dump() for a in all_items]
    cache.set(key, result, settings.cache_ttl["album_sublist"])
    return result


async def playlist_detail(cookie: dict, playlist_id: int, user_id: int | None) -> PlaylistDetail:
    key = f"playlist:{playlist_id}:detail"
    cached = cache.get(key)
    if cached:
        return PlaylistDetail(**cached)

    meta_resp = await ncm_call("playlist_detail", cookie=cookie, id=playlist_id)
    meta_body = meta_resp.body or {}
    if meta_resp.status != 200:
        raise bad_gateway("获取歌单详情失败")
    meta = meta_body.get("playlist") or {}
    if not meta or not meta.get("id"):
        raise not_found("歌单不存在")

    tracks_raw = await _playlist_tracks(cookie, playlist_id)
    detail = map_playlist_detail(meta, tracks_raw, user_id)
    cache.set(key, detail.model_dump(), settings.cache_ttl["playlist_detail"])
    return detail


async def _playlist_tracks(cookie: dict, playlist_id: int) -> list[dict]:
    key = f"playlist:{playlist_id}:tracks"
    cached = cache.get(key)
    if cached:
        return cached

    all_tracks: list[dict] = []
    offset = 0
    limit = 100
    while True:
        resp = await ncm_call(
            "playlist_track_all",
            cookie=cookie,
            id=playlist_id,
            limit=limit,
            offset=offset,
        )
        body = resp.body or {}
        if resp.status != 200:
            raise bad_gateway("获取歌单歌曲失败")
        songs = body.get("songs") or []
        all_tracks.extend(s for s in songs if isinstance(s, dict))
        if len(songs) < limit:
            break
        offset += limit
        if offset > 2000:
            break

    cache.set(key, all_tracks, settings.cache_ttl["playlist_detail"])
    return all_tracks


async def album_detail(cookie: dict, album_id: int) -> AlbumDetail:
    key = f"album:{album_id}:detail"
    cached = cache.get(key)
    if cached:
        return AlbumDetail(**cached)

    resp = await ncm_call("album", cookie=cookie, id=album_id)
    body = resp.body or {}
    if resp.status != 200:
        raise bad_gateway("获取专辑失败")
    album = body.get("album") or {}
    songs = body.get("songs") or []
    if not album or not album.get("id"):
        raise not_found("专辑不存在")

    detail = map_album_detail(album, [s for s in songs if isinstance(s, dict)])
    cache.set(key, detail.model_dump(), settings.cache_ttl["album_detail"])
    return detail
