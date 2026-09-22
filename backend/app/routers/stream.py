import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..core.config import settings
from ..services import music_service
from .deps import get_session

router = APIRouter(tags=["stream"])


@router.get("/stream/{song_id}")
async def stream(song_id: int, request: Request, session: dict = Depends(get_session)):
    song_url = await music_service.song_url(session["cookie"], song_id)
    if not song_url.playable or not song_url.url:
        raise HTTPException(status_code=403, detail={"code": 3001, "message": "暂无版权或无法播放"})

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": settings.stream_referer,
        "Accept": "*/*",
    }
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=120.0))
    req = client.build_request("GET", song_url.url, headers=headers)
    upstream = await client.send(req, stream=True)

    if upstream.status_code >= 400:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(
            status_code=502, detail={"code": 5001, "message": "音频源站请求失败"}
        )

    excluded = {"transfer-encoding", "connection", "content-encoding"}
    resp_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in excluded
    }
    resp_headers.setdefault("Accept-Ranges", "bytes")
    resp_headers.setdefault("Content-Type", "audio/mpeg")

    async def body_iter():
        try:
            async for chunk in upstream.aiter_bytes(1024 * 64):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        body_iter(),
        status_code=upstream.status_code,
        headers=resp_headers,
    )
