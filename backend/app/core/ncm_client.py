"""ncm_call RPC 客户端——主进程永不触碰 MusicLibrary 原生层。

SDK 运行在可丢弃的子进程 worker（app/core/ncm_worker.py）里：
原生崩溃（access violation 等）只死子进程，主进程丢弃它、拉起全新 worker
（干净的堆）并在其中重试一次；仍失败则返回可读 502。
FastAPI 进程永不崩溃。详见 docs/DEBUG.md（2026-06 子进程隔离落地）。

注意：进程内任何「崩溃后重试/重建实例」都是危险操作（堆已损坏，二次
ncm_init 必崩），本模块是唯一的重试边界——重试永远发生在新 OS 进程里。
"""

from __future__ import annotations

import asyncio
import json
import logging
import multiprocessing
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from MusicLibrary.common import Response

from .errors import bad_gateway
from .ncm_worker import main as worker_main

logger = logging.getLogger("csplayer.ncm")

CALL_TIMEOUT = 30.0  # 单次 SDK 调用超时（秒）
MAX_CONSECUTIVE_CRASHES = 3  # 连续崩溃达到此次数进入退避
COOLDOWN_S = 30.0  # 退避时长（秒）

# SDK 非线程安全：单线程 executor + 锁保证请求串行进 worker
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ncm-client")
_lock = threading.Lock()
_proc: Any = None
_conn: Any = None
_consecutive_crashes = 0
_cooldown_until = 0.0


class _WorkerCrashed(Exception):
    """worker 死亡/超时/崩溃退出——换新进程后可重试。"""


class _WorkerError(Exception):
    """SDK 业务错误（非原生崩溃）——重试无意义。"""


def _start_worker() -> tuple[Any, Any]:
    ctx = multiprocessing.get_context("spawn")
    parent_conn, child_conn = ctx.Pipe(duplex=True)
    proc = ctx.Process(
        target=worker_main, args=(child_conn,), daemon=True, name="ncm-sdk-worker"
    )
    proc.start()
    child_conn.close()
    logger.info("SDK worker 已启动 pid=%s", proc.pid)
    return proc, parent_conn


def _stop_worker() -> None:
    global _proc, _conn
    if _conn is not None:
        try:
            _conn.close()
        except OSError:
            pass
    if _proc is not None:
        try:
            _proc.kill()
        except Exception:  # noqa: BLE001 进程可能已死
            pass
        try:
            _proc.join(2)
        except Exception:  # noqa: BLE001
            pass
    _proc, _conn = None, None


def _ensure_worker() -> tuple[Any, Any]:
    global _proc, _conn
    if _proc is not None and _conn is not None and _proc.is_alive():
        return _proc, _conn
    _stop_worker()
    _proc, _conn = _start_worker()
    return _proc, _conn


def _invoke_once(fn_name: str, cookie: dict, kwargs: dict) -> dict:
    _, conn = _ensure_worker()
    try:
        conn.send({"fn": fn_name, "cookie": cookie, "kwargs": kwargs})
        if not conn.poll(CALL_TIMEOUT):
            raise _WorkerCrashed(f"worker 响应超时 ({CALL_TIMEOUT:.0f}s)")
        payload = conn.recv()
    except (EOFError, OSError) as exc:
        raise _WorkerCrashed(f"worker 异常退出: {exc}") from exc
    if not isinstance(payload, dict):
        raise _WorkerCrashed("worker 响应非法")
    if not payload.get("ok"):
        err = str(payload.get("error") or "unknown")
        if payload.get("crashed"):
            raise _WorkerCrashed(err)
        raise _WorkerError(err)
    return payload


def _to_response(payload: dict) -> Response:
    return Response(
        json.dumps(
            {
                "status": payload.get("status") or 500,
                "headers": payload.get("headers") or {},
                "body": payload.get("body") or {},
            }
        )
    )


def _call_serial(fn_name: str, cookie: dict, kwargs: dict) -> Response:
    global _consecutive_crashes, _cooldown_until
    with _lock:
        if time.time() < _cooldown_until:
            raise bad_gateway("音乐服务连续崩溃，请稍后重试")

        last_exc: Exception | None = None
        for attempt in (1, 2):
            try:
                payload = _invoke_once(fn_name, cookie, kwargs)
                _consecutive_crashes = 0
                return _to_response(payload)
            except _WorkerError as exc:
                logger.error("SDK 业务错误: %s: %s", fn_name, exc)
                raise bad_gateway("音乐服务内部错误，请重试") from exc
            except _WorkerCrashed as exc:
                last_exc = exc
                _consecutive_crashes += 1
                logger.warning(
                    "SDK worker 崩溃: %s (第 %d 次尝试): %s", fn_name, attempt, exc
                )
                _stop_worker()
                if _consecutive_crashes >= MAX_CONSECUTIVE_CRASHES:
                    _cooldown_until = time.time() + COOLDOWN_S
                    logger.error(
                        "SDK worker 连续崩溃 %d 次，进入 %.0fs 退避",
                        _consecutive_crashes,
                        COOLDOWN_S,
                    )
                    break
                # 下一轮循环 → 全新 worker（干净堆）中重试
        raise bad_gateway("音乐服务内部错误，请重试") from last_exc


async def ncm_call(fn_name: str, cookie: dict | None = None, **kwargs: Any) -> Response:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _executor, lambda: _call_serial(fn_name, cookie or {}, kwargs)
    )
