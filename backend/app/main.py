import logging
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .core import ncm_client
from .core.config import settings
from .core.logutil import install_logging
from .routers import artist as artist_router
from .routers import auth as auth_router
from .routers import search as search_router
from .routers import song as song_router
from .routers import stream as stream_router
from .routers import user as user_router

logger = logging.getLogger("csplayer.http")

# csplayer.* / uvicorn.* 日志统一出口（否则 INFO 无 handler 不输出，S0-1 perf 日志
# 依赖它）；formatter 全部包装脱敏（凭证只留在浏览器，见 core/logutil.py）
install_logging()


class GzipSkipPaths(GZipMiddleware):
    """GZip 中间件 + 路径排除。

    音频流 `/api/stream/*` 禁止二次压缩（设计 §4.3 c / §8 风险表），其余 API
    响应按阈值压缩（likes 千级曲目 JSON 收益最大）。
    """

    def __init__(self, app: ASGIApp, skip_prefixes: tuple[str, ...] = (), **kwargs) -> None:
        super().__init__(app, **kwargs)
        self.skip_prefixes = tuple(skip_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if path.startswith(self.skip_prefixes):
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)


class PerfLogMiddleware:
    """接口计时日志（S0-1 性能度量）：

    `perf GET /api/user/likes 200 812.3ms 512.0KB upstream=3 次 780.1ms`
    —— 端到端耗时 / 响应体积（含压缩后实际写出字节）/ 上游 SDK 占用，
    用于区分瓶颈在「上游 / 串行 / 体积」。/api/* 全量 INFO 记录。
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        ncm_client.reset_perf()
        start = time.perf_counter()
        status = 0
        size = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status, size
            if message["type"] == "http.response.start":
                status = message.get("status", 0)
            elif message["type"] == "http.response.body":
                size += len(message.get("body", b"") or b"")
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            calls, upstream_ms = ncm_client.perf_stats()
            logger.info(
                "perf %s %s %d %.1fms %.1fKB upstream=%d次 %.1fms",
                scope.get("method", ""),
                path,
                status,
                elapsed_ms,
                size / 1024,
                calls,
                upstream_ms,
            )


app = FastAPI(title="CsPlayer", version="0.1.8")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# GZip（S2-2）：阈值 1KB，排除音频流；perf 置于最外层，度量的是压缩后实际写出体积
app.add_middleware(
    GzipSkipPaths, skip_prefixes=("/api/stream",), minimum_size=1024
)
app.add_middleware(PerfLogMiddleware)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        content = {
            "code": detail.get("code", exc.status_code),
            "message": detail.get("message", "请求失败"),
            "data": None,
        }
    else:
        content = {"code": exc.status_code, "message": str(detail), "data": None}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.error("未处理异常: %s %s", request.url.path, exc, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"code": 5000, "message": "服务器内部错误", "data": None},
    )


@app.get("/api/health")
async def health():
    return {"code": 0, "message": "ok", "data": {"status": "up"}}


app.include_router(auth_router.router, prefix="/api/auth")
app.include_router(search_router.router, prefix="/api")
app.include_router(song_router.router, prefix="/api")
app.include_router(user_router.router, prefix="/api")
app.include_router(artist_router.router, prefix="/api")
app.include_router(stream_router.router, prefix="/api")
