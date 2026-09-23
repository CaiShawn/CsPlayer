from typing import Any

from pydantic import BaseModel

from .song import SongSummary


class ArtistBrief(BaseModel):
    id: int
    name: str
    avatarUrl: str = ""
    alias: str = ""
    musicSize: int = 0
    albumSize: int = 0


class ArtistDetail(BaseModel):
    id: int
    name: str
    avatarUrl: str = ""
    alias: str = ""
    briefDesc: str = ""
    hotSongs: list[SongSummary] = []


# 专辑列表走分页接口 GET /api/artist/{id}/albums（{items, hasMore, total}）


class SearchResult(BaseModel):
    """统一搜索结果信封：{ items, hasMore, total }。"""

    items: list[Any] = []
    hasMore: bool = False
    total: int = 0
