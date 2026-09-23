import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import settings
from .routers import auth as auth_router
from .routers import song as song_router
from .routers import stream as stream_router

logger = logging.getLogger("csplayer.http")

app = FastAPI(title="CsPlayer", version="0.1.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(song_router.router, prefix="/api")
app.include_router(stream_router.router, prefix="/api")
