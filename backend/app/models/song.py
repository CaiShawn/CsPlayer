from pydantic import BaseModel


class SongArtist(BaseModel):
    id: int = 0
    name: str = ""


class SongSummary(BaseModel):
    id: int
    name: str
    artists: list[SongArtist] = []
    albumId: int = 0
    albumName: str = ""
    coverUrl: str = ""
    durationMs: int = 0
    playable: bool = True
    reason: str = ""


class SongUrl(BaseModel):
    id: int
    url: str = ""
    br: int = 0
    expireAt: int = 0
    playable: bool = True


class LyricLine(BaseModel):
    timeMs: int
    text: str


class Lyric(BaseModel):
    lrc: list[LyricLine] = []
    tlyric: list[LyricLine] = []
    hasTime: bool = True
