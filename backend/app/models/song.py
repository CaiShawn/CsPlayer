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
    level: str = "lossless"
    expireAt: int = 0
    playable: bool = True


class LyricLine(BaseModel):
    timeMs: int
    text: str


class Lyric(BaseModel):
    lrc: list[LyricLine] = []
    tlyric: list[LyricLine] = []
    hasTime: bool = True


class LikedSongs(BaseModel):
    playlistId: int = 0
    tracks: list[SongSummary] = []
    ids: list[int] = []


class LikeResult(BaseModel):
    id: int
    liked: bool


class RecordItem(BaseModel):
    song: SongSummary
    playCount: int = 0
    score: int = 0
