from dataclasses import dataclass, field


@dataclass
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    cookie_name: str = "wyy_session"
    session_ttl: int = 7 * 24 * 3600
    cache_ttl: dict[str, int] = field(
        default_factory=lambda: {
            "user_profile": 300,
            "user_playlists": 60,
            "album_sublist": 60,
            "playlist_detail": 120,
            "album_detail": 300,
            "song_url": 60,
            "lyric": 3600,
            "song_detail": 300,
            "user_likes": 60,
            "user_liked_ids": 60,
            "user_recent": 60,
            "search": 60,
            "artist_detail": 300,
        }
    )
    stream_referer: str = "https://music.163.com"
    executor_workers: int = 4


settings = Settings()
