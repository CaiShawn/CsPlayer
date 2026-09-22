from pydantic import BaseModel

from .song import SongSummary


class PlaylistBrief(BaseModel):
    id: int
    name: str
    coverUrl: str = ""
    trackCount: int = 0
    creatorName: str = ""
    subscribed: bool = False


class PlaylistDetail(BaseModel):
    id: int
    name: str
    coverUrl: str = ""
    description: str = ""
    creatorName: str = ""
    subscribed: bool = False
    trackCount: int = 0
    tracks: list[SongSummary] = []
