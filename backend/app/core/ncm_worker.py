"""MusicLibrary SDK 隔离 worker（子进程）。

本进程是唯一持有 MusicLibrary / QuickJS / engine.dll 的地方。
原生崩溃（access violation 等）只杀死本进程；主进程经 Pipe 检测到后
自动重启一个全新 worker，FastAPI 进程永不崩溃。详见 docs/archived/DEBUG.md
（2026-06 · 歌单/我喜欢 偶发 502 排查与子进程隔离落地）。

协议（multiprocessing.Pipe，二进制 pickle；不走 stdio——SDK 会往 stdout 打噪声）：
  请求: {"fn": str, "cookie": dict, "kwargs": dict}
  响应: {"ok": True,  "status": int, "headers": dict, "body": dict}
        {"ok": False, "crashed": bool, "error": str}

约束：
  1. 顶层禁止 import MusicLibrary——spawn 时主进程也会 import 本模块，
     原生库只能在子进程内加载；
  2. SDK 非线程安全：本 worker 单线程串行处理请求；
  3. 崩溃（OSError/access violation）后回包即自杀退出：堆已不可信，
     绝不在本进程接下一个请求，换新进程是唯一恢复手段。
"""

from __future__ import annotations

from typing import Any

__all__ = ["main"]


def _safe_send(conn: Any, payload: dict) -> None:
    try:
        conn.send(payload)
    except BaseException:  # noqa: BLE001 管道已断 = 主进程已丢弃我们，直接死
        pass


def main(conn: Any) -> None:
    from MusicLibrary.neteaseCloudMusicApi import NeteaseCloudMusicApi

    try:
        api = NeteaseCloudMusicApi()
    except BaseException as exc:  # noqa: BLE001 ncm_init 崩溃也算 crash
        _safe_send(conn, {"ok": False, "crashed": True, "error": f"init failed: {exc}"})
        return

    while True:
        try:
            req = conn.recv()
        except (EOFError, OSError):
            # 主进程关闭管道 → 正常退出（daemon 进程，主进程退出也会走到这）
            return
        if not isinstance(req, dict):
            continue

        fn_name = str(req.get("fn") or "")
        cookie = req.get("cookie") or {}
        kwargs = req.get("kwargs") or {}

        try:
            method = getattr(api, fn_name)
            resp = method(cookie=cookie, **kwargs)
        except BaseException as exc:  # noqa: BLE001 崩溃必须在此兜住/上报/退出
            crashed = isinstance(exc, OSError) or "access violation" in str(exc)
            _safe_send(
                conn,
                {
                    "ok": False,
                    "crashed": crashed,
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            if crashed:
                return
            # 非原生异常：上下文仍可信，继续服务
            continue

        _safe_send(
            conn,
            {
                "ok": True,
                "status": resp.status,
                "headers": resp.headers or {},
                "body": resp.body or {},
            },
        )
