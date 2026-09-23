"""Map raw NCM body dicts → DTOs."""

from ..models.album import AlbumBrief, AlbumDetail
from ..models.playlist import PlaylistBrief, PlaylistDetail
from ..models.search import ArtistBrief
from ..models.song import SongArtist, SongSummary
from ..models.user import UserProfile


def _artists(raw: list | None) -> list[SongArtist]:
    result: list[SongArtist] = []
    for a in raw or []:
        if not isinstance(a, dict):
            continue
        result.append(
            SongArtist(
                id=int(a.get("id") or 0),
                name=str(a.get("name") or ""),
            )
        )
    return result


def map_song(raw: dict) -> SongSummary:
    album = raw.get("al") or raw.get("album") or {}
    artists = raw.get("ar") or raw.get("artists") or []
    duration = raw.get("dt") or raw.get("duration") or 0
    cover = album.get("picUrl") or raw.get("picUrl") or ""
    return SongSummary(
        id=int(raw.get("id") or 0),
        name=str(raw.get("name") or ""),
        artists=_artists(artists if isinstance(artists, list) else []),
        albumId=int(album.get("id") or 0),
        albumName=str(album.get("name") or ""),
        coverUrl=str(cover or ""),
        durationMs=int(duration or 0),
        playable=True,
    )


def map_artist_brief(raw: dict) -> ArtistBrief:
    alias = raw.get("alias") or raw.get("transNames") or []
    if isinstance(alias, str):
        alias = [alias]
    alias_text = " / ".join(str(a) for a in alias if a)
    avatar = raw.get("picUrl") or raw.get("img1v1Url") or ""
    return ArtistBrief(
        id=int(raw.get("id") or 0),
        name=str(raw.get("name") or ""),
        avatarUrl=str(avatar or ""),
        alias=alias_text,
        musicSize=int(raw.get("musicSize") or 0),
        albumSize=int(raw.get("albumSize") or 0),
    )


def map_user_profile(account: dict, profile: dict | None = None) -> UserProfile:
    profile = profile or account.get("profile") or {}
    return UserProfile(
        userId=int(profile.get("userId") or account.get("id") or 0),
        nickname=str(profile.get("nickname") or ""),
        avatarUrl=str(profile.get("avatarUrl") or ""),
        signature=str(profile.get("signature") or ""),
    )


def map_playlist_brief(raw: dict, user_id: int | None = None) -> PlaylistBrief:
    creator = raw.get("creator") or {}
    creator_id = creator.get("userId")
    subscribed = bool(raw.get("subscribed"))
    if user_id is not None and creator_id is not None:
        subscribed = int(creator_id) != int(user_id)
    return PlaylistBrief(
        id=int(raw.get("id") or 0),
        name=str(raw.get("name") or ""),
        coverUrl=str(raw.get("coverImgUrl") or raw.get("picUrl") or ""),
        trackCount=int(raw.get("trackCount") or 0),
        creatorName=str(creator.get("nickname") or ""),
        subscribed=subscribed,
    )


def map_playlist_detail(
    meta: dict, tracks: list[dict], user_id: int | None = None
) -> PlaylistDetail:
    brief = map_playlist_brief(meta, user_id)
    songs = [map_song(t) for t in tracks if isinstance(t, dict) and t.get("id")]
    return PlaylistDetail(
        id=brief.id,
        name=brief.name,
        coverUrl=brief.coverUrl,
        description=str(meta.get("description") or ""),
        creatorName=brief.creatorName,
        subscribed=brief.subscribed,
        trackCount=brief.trackCount or len(songs),
        tracks=songs,
    )


def map_album_brief(raw: dict) -> AlbumBrief:
    artist = raw.get("artist") or {}
    artists = raw.get("artists") or []
    artist_id = artist.get("id")
    artist_name = artist.get("name")
    if artists and isinstance(artists[0], dict):
        if not artist_id:
            artist_id = artists[0].get("id")
        if not artist_name:
            artist_name = artists[0].get("name")
    return AlbumBrief(
        id=int(raw.get("id") or 0),
        name=str(raw.get("name") or ""),
        coverUrl=str(raw.get("picUrl") or raw.get("blurPicUrl") or ""),
        artistId=int(artist_id or 0),
        artistName=str(artist_name or ""),
        publishTime=raw.get("publishTime"),
        size=int(raw.get("size") or 0),
    )


def map_album_detail(meta: dict, songs: list[dict]) -> AlbumDetail:
    brief = map_album_brief(meta)
    artist = meta.get("artist") or {}
    tracks = [map_song(s) for s in songs if isinstance(s, dict) and s.get("id")]
    return AlbumDetail(
        id=brief.id,
        name=brief.name,
        coverUrl=brief.coverUrl,
        artistId=int(artist.get("id") or 0),
        artistName=brief.artistName,
        description=str(meta.get("description") or ""),
        publishTime=brief.publishTime,
        tracks=tracks,
    )
