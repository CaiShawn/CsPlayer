import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from MusicLibrary.common import Response
from MusicLibrary.neteaseCloudMusicApi import NeteaseCloudMusicApi

from .config import settings

# SDK / QuickJS 非线程安全：固定单线程 + 进程内单例，禁止 destroy（会拆掉全局上下文）
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ncm-sdk")
_lock = threading.Lock()
_api: NeteaseCloudMusicApi | None = None


def _get_api() -> NeteaseCloudMusicApi:
    global _api
    if _api is None:
        _api = NeteaseCloudMusicApi()
    return _api


def _reset_api() -> None:
    """原生崩溃后重建实例，恢复后续请求。"""
    global _api
    _api = None


def _invoke(fn_name: str, cookie: dict | None = None, **kwargs: Any) -> Response:
    api = _get_api()
    method = getattr(api, fn_name)
    return method(cookie=cookie or {}, **kwargs)


async def ncm_call(fn_name: str, cookie: dict | None = None, **kwargs: Any) -> Response:
    loop = asyncio.get_running_loop()

    def runner() -> Response:
        with _lock:
            try:
                return _invoke(fn_name, cookie, **kwargs)
            except Exception:
                # 某些路由（如 record/recent/song）可能抛 access violation，
                # 重建实例避免整条 SDK 链路瘫痪
                _reset_api()
                raise

    return await loop.run_in_executor(_executor, runner)
