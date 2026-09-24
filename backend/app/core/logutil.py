"""日志脱敏 —— 登录凭证只留在浏览器（2026-09 审计加固）。

网易云登录凭证（MUSIC_U 等）只允许存在于：浏览器 localStorage（v0.1.4 起）与
后端**内存**会话（随进程消失、零落盘）。绝不允许进日志。已审计到的泄漏面：

1. **SDK 原生层 stdout 噪声（真实泄漏源）**：MusicLibrary/QuickJS 会打印
   `[ROUTE] route: /likelist, cookie: {"MUSIC_U": "...", ...}` ——且是**原生层
   直写 OS 文件句柄 1**（engine.dll 的 printf/console.log 转发），worker 子进程
   继承 uvicorn 的 stdout，既绕过 logging、也绕过 `sys.stdout` 包装（v1 装了
   Python 层包装后实测仍泄漏），必须在 **fd 层**接管；
2. 应用日志与**异常栈文本**：SDK 错误串、Pydantic 校验错误等会回显输入值；
3. uvicorn access / error 日志（URL query、异常）。

统一出口 `redact()`：敏感键值（token/cookie/csrf/MUSIC_* 等）→ `[REDACTED]`，
带 query 的 URL → query 段 `[REDACTED]`。覆盖点：`install_logging()`（csplayer +
uvicorn 全部 handler 的 formatter 包装，含异常栈）；`install_worker_redaction()`
（SDK 子进程 fd 1/2 接管 + 泵线程按行脱敏转发，兼包 `sys.stdout`）。
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import sys
import threading
from typing import Any

__all__ = [
    "redact",
    "RedactingFormatter",
    "install_logging",
    "install_worker_redaction",
    "cred_fingerprint",
]

REDACTED = "[REDACTED]"

# 敏感键名（不区分大小写；music_* 覆盖 MUSIC_U / MUSIC_A_T / MUSIC_R_T 等全套 cookie）
_SECRET_KEY = (
    r"(?:[a-z0-9_-]*(?:token|secret|apikey|api_key)[a-z0-9_-]*"
    r"|music_[a-z0-9_]+|__csrf|nmtid|nuid|wyy_session|csrf"
    r"|cookie|set-cookie|unikey|authorization)"
)

_RULES: list[tuple[re.Pattern[str], str]] = [
    # "key": "value" / 'key': 'value'（JSON / dict repr；空白不跨行，防吞换行）
    (
        re.compile(rf"(?i)([\"']?{_SECRET_KEY}[\"']?[ \t]*[:=][ \t]*)([\"'])[^\"']*\2"),
        rf"\1\2{REDACTED}\2",
    ),
    # key=value / key: value（cookie 串、SDK 噪声的标量值）。约束：值非空、空白不跨行、
    # 值以 { [ " ' 开头的跳过（空 dict `cookie: {}` 不动，非空 dict 由上一条逐键脱敏；
    # `TOKEN=` 这类空值不含秘密，保持原样）
    (
        re.compile(
            rf"(?i)([\"']?{_SECRET_KEY}[\"']?[ \t]*[:=][ \t]*)(?![\s\"'{{\[])([^,;}}\)\]\s]+)"
        ),
        rf"\1{REDACTED}",
    ),
    # URL query（可能带签名 / token）：只留主机与路径
    (
        re.compile(r"(?i)(https?://[^\s\"'?#]+)\?[^\s\"']*"),
        rf"\1?{REDACTED}",
    ),
]


def redact(text: str) -> str:
    """把文本中的凭证类敏感值替换为 [REDACTED]（幂等）。"""
    for pattern, repl in _RULES:
        text = pattern.sub(repl, text)
    return text


def cred_fingerprint(secret: str) -> str:
    """凭证指纹（sha256 前 16 位）——缓存键等内部标识用，替代明文前缀。"""
    return hashlib.sha256(secret.encode("utf-8", "replace")).hexdigest()[:16]


class RedactingFormatter(logging.Formatter):
    """包装任意 formatter：输出前整体脱敏（format() 产物含异常栈文本）。"""

    def __init__(self, inner: logging.Formatter | None = None) -> None:
        self.inner = inner or logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s"
        )

    def format(self, record: logging.LogRecord) -> str:
        return redact(self.inner.format(record))


class _RedactedStream:
    """写转发前脱敏的文本流（拦截 SDK 的 print 噪声）。"""

    def __init__(self, inner: Any) -> None:
        self._inner = inner

    def write(self, text: Any) -> Any:
        try:
            return self._inner.write(redact(str(text)))
        except Exception:  # noqa: BLE001 日志通道永不抛
            return 0

    def flush(self) -> None:
        try:
            self._inner.flush()
        except Exception:  # noqa: BLE001
            pass

    def isatty(self) -> bool:
        try:
            return bool(self._inner.isatty())
        except Exception:  # noqa: BLE001
            return False

    @property
    def encoding(self) -> str | None:
        return getattr(self._inner, "encoding", "utf-8")

    def fileno(self) -> int:
        return self._inner.fileno()


def _wrap_handler(h: logging.Handler) -> None:
    if not isinstance(h.formatter, RedactingFormatter):
        h.setFormatter(RedactingFormatter(h.formatter))


def install_logging() -> None:
    """csplayer.* 与 uvicorn.* 的全部 handler 输出统一脱敏（幂等）。"""
    cs = logging.getLogger("csplayer")
    if not cs.handlers:
        h = logging.StreamHandler()
        h.setFormatter(RedactingFormatter())
        cs.addHandler(h)
        cs.propagate = False
    else:
        for h in cs.handlers:
            _wrap_handler(h)
    cs.setLevel(logging.INFO)

    # uvicorn 的 access / error 日志同样可能带 URL、异常栈
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        for h in logging.getLogger(name).handlers:
            _wrap_handler(h)


def install_worker_redaction() -> None:
    """SDK 子进程入口处调用：**fd 层**接管 stdout/stderr，泵线程按行脱敏转发。

    不能只换 `sys.stdout`——SDK 噪声来自原生层（QuickJS / engine.dll），直接写
    OS 文件句柄 1，Python 包装拦不住（2026-09 实测二次泄漏）。做法：dup 保留
    真实输出 fd → 管道替换 fd 1/2 → 泵线程按行读管道、redact 后写回真实 fd。
    Python 层 `_RedactedStream` 仍包一层（双保险；其写入会经 fd 层再次脱敏，幂等）。
    """
    _install_fd_redirection(1)
    _install_fd_redirection(2)
    if not isinstance(sys.stdout, _RedactedStream):
        sys.stdout = _RedactedStream(sys.stdout)  # type: ignore[assignment]
    if not isinstance(sys.stderr, _RedactedStream):
        sys.stderr = _RedactedStream(sys.stderr)  # type: ignore[assignment]


def _install_fd_redirection(fd: int) -> None:
    try:
        real_fd = os.dup(fd)
        r, w = os.pipe()
        os.dup2(w, fd)
        os.close(w)
    except OSError:
        return  # 环境异常时宁可不拦，也不能阻断 SDK 输出
    threading.Thread(
        target=_pump, args=(r, real_fd), daemon=True, name=f"redact-fd{fd}"
    ).start()


def _pump(r: int, out_fd: int) -> None:
    """按行读管道 → 脱敏 → 写回真实 fd（行内模式不会被块边界截断泄漏）。"""
    buf = b""
    try:
        while True:
            chunk = os.read(r, 4096)
            if not chunk:
                break
            buf += chunk
            while True:
                i = buf.find(b"\n")
                if i < 0:
                    break
                line, buf = buf[: i + 1], buf[i + 1 :]
                _write_redacted(out_fd, line)
        if buf:
            _write_redacted(out_fd, buf)  # 末尾无换行的残留同样脱敏
    except OSError:
        pass
    finally:
        for fd_ in (r, out_fd):
            try:
                os.close(fd_)
            except OSError:
                pass


def _write_redacted(out_fd: int, raw: bytes) -> None:
    text = redact(raw.decode("utf-8", "replace"))
    os.write(out_fd, text.encode("utf-8", "replace"))
