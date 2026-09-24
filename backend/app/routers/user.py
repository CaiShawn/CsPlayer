"""用户库路由（/api/user/*）：歌单、收藏专辑、我喜欢、听歌排行。"""

from fastapi import APIRouter, Depends, Query

from ..models.common import ApiResponse, ok
from ..services import library_service
from .deps import get_session

router = APIRouter(tags=["library", "user"])


@router.get("/user/playlists")
async def user_playlists(session: dict = Depends(get_session)) -> ApiResponse:
    data = await library_service.user_playlists(session["cookie"], session["user_id"])
    return ok(data)


@router.get("/user/albums")
async def user_albums(
    offset: int = Query(default=0, ge=0),
    limit: int | None = Query(default=40, ge=1, le=200),
    session: dict = Depends(get_session),
) -> ApiResponse:
    """收藏专辑分页：每批 40 张按需补拉（滚动到底续拉，不一次拉全量）。"""
    data = await library_service.user_albums(
        session["cookie"], session["user_id"], offset=offset, limit=limit
    )
    return ok(data)


@router.get("/user/likes")
async def user_likes(
    offset: int = Query(default=0, ge=0),
    limit: int | None = Query(default=40, ge=1, le=200),
    session: dict = Depends(get_session),
) -> ApiResponse:
    """我喜欢：每批 40 首按需补拉（滚动到底续拉，不一次拉全量）。"""
    data = await library_service.user_likes(
        session["cookie"], session["user_id"], offset=offset, limit=limit
    )
    # 字段裁剪（S2-1）：ids 与 tracks[].id 全量冗余（千级曲目 ≈ 8KB），
    # 前端自 tracks 派生，不再下发；total/hasMore 供滚动续拉
    return ok(data.model_dump(exclude={"ids"}))


@router.get("/user/liked-ids")
async def user_liked_ids(session: dict = Depends(get_session)) -> ApiResponse:
    ids = await library_service.user_liked_ids(session["cookie"], session["user_id"])
    return ok({"ids": ids})


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
