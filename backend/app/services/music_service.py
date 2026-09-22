import re
import time

from ..core.cache import cache
from ..core.config import settings
from ..core.errors import bad_gateway, not_found
from ..core.ncm_client import ncm_call
from ..models.song import Lyric, LyricLine, SongSummary, SongUrl
from .mappers import map_song

_LRC_TIME = re.compile(r"\[(\d+):(\d+)(?:[.:](\d+))?\]")


def parse_lrc_text(raw: str) -> list[LyricLine]:
    lines: list[LyricLine] = []
    if not raw:
        return lines
    for line in raw.splitlines():
        times = _LRC_TIME.findall(line)
        if not times:
            continue
        text = _LRC_TIME.sub("", line).strip()
        for mm, ss, frac in times:
            minutes = int(mm)
            seconds = int(ss)
            if frac:
                # frac may be 2 or 3 digits
                ms = int(frac.ljust(3, "0")[:3])
            else:
                ms = 0
            lines.append(LyricLine(timeMs=minutes * 60000 + seconds * 1000 + ms, text=text))
    lines.sort(key=lambda x: x.timeMs)
    return lines


def _plain_lyric(raw: str) -> list[LyricLine]:
    return [
        LyricLine(timeMs=0, text=line.strip())
        for line in raw.splitlines()
        if line.strip()
    ]


async def song_detail(cookie: dict, song_id: int) -> SongSummary:
    key = f"song:{song_id}:detail"
    cached = cache.get(key)
    if cached:
        return SongSummary(**cached)

    resp = await ncm_call("song_detail", cookie=cookie, ids=str(song_id))
    body = resp.body or {}
    if resp.status != 200:
        raise bad_gateway("获取歌曲详情失败")
    songs = body.get("songs") or []
    if not songs:
        raise not_found("歌曲不存在")
    summary = map_song(songs[0])
    cache.set(key, summary.model_dump(), settings.cache_ttl["song_detail"])
    return summary


async def song_url(cookie: dict, song_id: int) -> SongUrl:
    key = f"song:{song_id}:url"
    cached = cache.get(key)
    if cached:
        return SongUrl(**cached)

    resp = await ncm_call("song_url", cookie=cookie, id=str(song_id), br=999000)
    body = resp.body or {}
    if resp.status != 200:
        raise bad_gateway("获取播放地址失败")
    data = (body.get("data") or [])
    item = data[0] if data and isinstance(data[0], dict) else {}
    url = item.get("url") or ""
    result = SongUrl(
        id=song_id,
        url=url,
        br=int(item.get("br") or 0),
        expireAt=int(time.time()) + settings.cache_ttl["song_url"],
        playable=bool(url),
    )
    cache.set(key, result.model_dump(), settings.cache_ttl["song_url"])
    return result


async def get_lyric(cookie: dict, song_id: int) -> Lyric:
    key = f"song:{song_id}:lyric"
    cached = cache.get(key)
    if cached:
        return Lyric(**cached)

    resp = await ncm_call("lyric", cookie=cookie, id=str(song_id))
    body = resp.body or {}
    if resp.status != 200:
        raise bad_gateway("获取歌词失败")

    lrc_raw = (body.get("lrc") or {}).get("lyric") or ""
    tlyric_raw = (body.get("tlyric") or {}).get("lyric") or ""
    lrc = parse_lrc_text(lrc_raw)
    tlyric = parse_lrc_text(tlyric_raw)
    has_time = bool(lrc)
    if not lrc and lrc_raw:
        lrc = _plain_lyric(lrc_raw)

    result = Lyric(lrc=lrc, tlyric=tlyric, hasTime=has_time)
    cache.set(key, result.model_dump(), settings.cache_ttl["lyric"])
    return result
