"""搜索路由（/api/search）。

歌手详情 / 专辑分页（/api/artist/*）已归位 artist.py（service 仍在 search_service）。
"""

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
