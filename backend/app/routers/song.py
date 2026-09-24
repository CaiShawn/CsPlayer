"""歌曲与单行资源路由（/api/song/*、/api/playlist/*、/api/album/*）。

用户库（/api/user/*）见 user.py；歌手（/api/artist/*）见 artist.py。
"""

from fastapi import APIRouter, Body, Depends, Query

from ..models.common import ApiResponse, ok
from ..services import library_service, music_service
from .deps import get_session

router = APIRouter(tags=["library", "song"])


@router.get("/playlist/{playlist_id}")
async def playlist_detail(
    playlist_id: int, session: dict = Depends(get_session)
) -> ApiResponse:
    detail = await library_service.playlist_detail(
        session["cookie"], playlist_id, session["user_id"]
    )
    return ok(detail.model_dump())


@router.get("/album/{album_id}")
async def album_detail(
    album_id: int, session: dict = Depends(get_session)
) -> ApiResponse:
    detail = await library_service.album_detail(session["cookie"], album_id)
    return ok(detail.model_dump())


@router.get("/song/{song_id}/url")
async def song_url(
    song_id: int,
    level: str | None = Query(default=None),
    session: dict = Depends(get_session),
) -> ApiResponse:
    data = await music_service.song_url(session["cookie"], song_id, level=level)
    # do not expose upstream url to browser; stream goes through proxy
    payload = data.model_dump()
    if payload.get("playable"):
        q = data.level or "lossless"
        payload["url"] = f"/api/stream/{song_id}?level={q}"
    else:
        payload["url"] = ""
    return ok(payload)


@router.get("/song/{song_id}/lyric")
async def song_lyric(song_id: int, session: dict = Depends(get_session)) -> ApiResponse:
    data = await music_service.get_lyric(session["cookie"], song_id)
    return ok(data.model_dump())


@router.get("/song/{song_id}/detail")
async def song_detail(song_id: int, session: dict = Depends(get_session)) -> ApiResponse:
    data = await music_service.song_detail(session["cookie"], song_id)
    return ok(data.model_dump())


@router.post("/song/{song_id}/like")
async def song_like(
    song_id: int,
    body: dict = Body(default={}),
    session: dict = Depends(get_session),
) -> ApiResponse:
    like = bool((body or {}).get("like", True))
    data = await library_service.toggle_like(
        session["cookie"], session["user_id"], song_id, like
    )
    return ok(data.model_dump())
