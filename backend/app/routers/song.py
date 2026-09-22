from fastapi import APIRouter, Depends

from ..models.common import ApiResponse, ok
from ..services import library_service, music_service
from .deps import get_session

router = APIRouter(tags=["library", "song"])


@router.get("/user/playlists")
async def user_playlists(session: dict = Depends(get_session)) -> ApiResponse:
    data = await library_service.user_playlists(session["cookie"], session["user_id"])
    return ok(data)


@router.get("/user/albums")
async def user_albums(session: dict = Depends(get_session)) -> ApiResponse:
    data = await library_service.user_albums(session["cookie"], session["user_id"])
    return ok(data)


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
async def song_url(song_id: int, session: dict = Depends(get_session)) -> ApiResponse:
    data = await music_service.song_url(session["cookie"], song_id)
    # do not expose upstream url to browser; stream goes through proxy
    payload = data.model_dump()
    if payload.get("playable"):
        payload["url"] = f"/api/stream/{song_id}"
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
