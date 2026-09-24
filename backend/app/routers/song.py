from fastapi import APIRouter, Body, Depends, Query

from ..models.common import ApiResponse, ok
from ..services import library_service, music_service
from .deps import get_session

router = APIRouter(tags=["library", "song"])


@router.get("/user/playlists")
async def user_playlists(session: dict = Depends(get_session)) -> ApiResponse:
    data = await library_service.user_playlists(session["cookie"], session["user_id"])
    return ok(data)


@router.get("/user/albums")
async def user_albums(
    offset: int = Query(default=0, ge=0),
    limit: int | None = Query(default=None, ge=1, le=200),
    session: dict = Depends(get_session),
) -> ApiResponse:
    data = await library_service.user_albums(
        session["cookie"], session["user_id"], offset=offset, limit=limit
    )
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


@router.get("/user/likes")
async def user_likes(session: dict = Depends(get_session)) -> ApiResponse:
    data = await library_service.user_likes(session["cookie"], session["user_id"])
    # 字段裁剪（S2-1）：ids 与 tracks[].id 全量冗余（千级曲目 ≈ 8KB），
    # 前端自 tracks 派生，不再下发
    return ok(data.model_dump(exclude={"ids"}))


@router.get("/user/liked-ids")
async def user_liked_ids(session: dict = Depends(get_session)) -> ApiResponse:
    ids = await library_service.user_liked_ids(session["cookie"], session["user_id"])
    return ok({"ids": ids})


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


@router.get("/user/record")
async def user_record(
    type: str = Query(default="all", pattern="^(all|week)$"),
    limit: int = Query(default=50, ge=1, le=100),
    session: dict = Depends(get_session),
) -> ApiResponse:
    items = await library_service.user_record_rank(
        session["cookie"], session["user_id"], type=type, limit=limit
    )
    return ok([i.model_dump() for i in items])
