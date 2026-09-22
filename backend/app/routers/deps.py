from fastapi import Cookie, Depends, HTTPException, Response

from ..core.config import settings
from ..core.session import sessions


def get_session(
    response: Response,
    wyy_session: str | None = Cookie(default=None, alias=settings.cookie_name),
) -> dict:
    sid = wyy_session
    if not sid:
        raise HTTPException(
            status_code=401, detail={"code": 1001, "message": "未登录"}
        )
    item = sessions.get(sid)
    if not item:
        raise HTTPException(
            status_code=401, detail={"code": 1001, "message": "会话已失效，请重新登录"}
        )
    return {"sid": sid, "cookie": item["cookie"], "user_id": item["user_id"]}


def set_session_cookie(response: Response, sid: str) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=sid,
        httponly=True,
        samesite="lax",
        max_age=settings.session_ttl,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.cookie_name, path="/")
