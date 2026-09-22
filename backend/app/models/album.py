from pydantic import BaseModel

from .song import SongSummary


class AlbumBrief(BaseModel):
    id: int
    name: str
    coverUrl: str = ""
    artistName: str = ""
    publishTime: int | None = None
    size: int = 0


class AlbumDetail(BaseModel):
    id: int
    name: str
    coverUrl: str = ""
    artistId: int = 0
    artistName: str = ""
    description: str = ""
    publishTime: int | None = None
    tracks: list[SongSummary] = []
