from fastapi import APIRouter, Depends, Query

from ..models.common import ApiResponse, ok
from ..services import search_service
from .deps import get_session

router = APIRouter(tags=["search"])


@router.get("/search")
async def search(
    kw: str = Query(default=""),
    type: str = Query(default="song"),
    limit: int = Query(default=40, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    session: dict = Depends(get_session),
) -> ApiResponse:
    data = await search_service.search(
        session["cookie"],
        kw,
        search_type=type,
        limit=limit,
        offset=offset,
        scope=str(session["user_id"]),
    )
    return ok(data)


@router.get("/artist/{artist_id}")
async def artist_detail(
    artist_id: int, session: dict = Depends(get_session)
) -> ApiResponse:
    detail = await search_service.artist_detail(session["cookie"], artist_id)
    return ok(detail.model_dump())


@router.get("/artist/{artist_id}/albums")
async def artist_albums(
    artist_id: int,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=40, ge=1, le=50),
    session: dict = Depends(get_session),
) -> ApiResponse:
    data = await search_service.artist_albums(
        session["cookie"], artist_id, offset=offset, limit=limit
    )
    return ok(data)
