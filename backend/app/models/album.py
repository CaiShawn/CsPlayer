from pydantic import BaseModel

from .song import SongSummary


class AlbumBrief(BaseModel):
    # 字段集 = 前端实际使用集（S2-1 裁剪：publishTime / size 无消费方）
    id: int
    name: str
    coverUrl: str = ""
    artistId: int = 0
    artistName: str = ""


class AlbumDetail(BaseModel):
    id: int
    name: str
    coverUrl: str = ""
    artistId: int = 0
    artistName: str = ""
    description: str = ""
    publishTime: int | None = None
    tracks: list[SongSummary] = []
