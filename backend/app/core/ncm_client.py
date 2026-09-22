import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from MusicLibrary.common import Response
from MusicLibrary.neteaseCloudMusicApi import NeteaseCloudMusicApi

from .errors import bad_gateway

# SDK / QuickJS 非线程安全：固定单线程 + 进程内单例。
# destroy()/destroy_context() 会拆掉全局上下文，之后 ncm_init 可能 access violation，
# 因此禁止原生销毁，异常时只丢弃 Python 引用并保留旧实例（故意泄漏）。
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ncm-sdk")
_lock = threading.Lock()
_api: NeteaseCloudMusicApi | None = None
_retired: list[Any] = []
_patched = False


def _patch_api_lifecycle() -> None:
    """Prevent partial-init __del__ / native destroy from poisoning the SDK."""
    global _patched
    if _patched:
        return

    orig_init = NeteaseCloudMusicApi.__init__

    def __init__(self, env: Any = None) -> None:
        # 若 super().__init__ 中途失败，保证 __del__ 看到安全默认值
        self._destroyed = True
        orig_init(self, env)

    def destroy(self) -> None:
        self._destroyed = True

    def __del__(self) -> None:
        try:
            self.destroy()
        except Exception:
            pass

    NeteaseCloudMusicApi.__init__ = __init__
    NeteaseCloudMusicApi.destroy = destroy
    NeteaseCloudMusicApi.__del__ = __del__
    _patched = True


_patch_api_lifecycle()


def _get_api() -> NeteaseCloudMusicApi:
    global _api
    if _api is None:
        try:
            _api = NeteaseCloudMusicApi()
        except OSError as exc:
            _api = None
            raise bad_gateway("音乐 SDK 初始化失败") from exc
    return _api


def _reset_api() -> None:
    """Drop the live handle but keep the instance so destroy() never runs."""
    global _api
    if _api is not None:
        _retired.append(_api)
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
            except Exception as exc:
                # 原生崩溃（access violation 等）后重建 Python 侧实例，
                # 但不 destroy 旧上下文，避免后续 ncm_init 空指针。
                _reset_api()
                if isinstance(exc, OSError) or "access violation" in str(exc):
                    raise bad_gateway(f"音乐 SDK 调用失败: {fn_name}") from exc
                raise

    return await loop.run_in_executor(_executor, runner)
