from fastapi import APIRouter, Depends, Response

from ..models.common import ApiResponse, ok
from ..models.user import UserProfile
from ..services import auth_service
from .deps import clear_session_cookie, get_session, set_session_cookie

router = APIRouter(tags=["auth"])


@router.post("/qr/key")
async def qr_key() -> ApiResponse:
    return ok(await auth_service.qr_key())


@router.post("/qr/create")
async def qr_create(body: dict) -> ApiResponse:
    unikey = body.get("unikey") or ""
    if not unikey:
        return ApiResponse(code=1002, message="缺少 unikey", data=None)
    return ok(await auth_service.qr_create(unikey))


@router.post("/qr/check")
async def qr_check(body: dict, response: Response) -> ApiResponse:
    unikey = body.get("unikey") or ""
    if not unikey:
        return ApiResponse(code=1002, message="缺少 unikey", data=None)
    result = await auth_service.qr_check(unikey)
    if result.get("status") == "success":
        set_session_cookie(response, result["sid"])
        return ok(
            {
                "status": "success",
                "user": result["user"].model_dump(),
            }
        )
    return ok({"status": result["status"]})


@router.get("/me")
async def me(session: dict = Depends(get_session)) -> ApiResponse:
    user: UserProfile = await auth_service.get_me(session["cookie"])
    return ok(user.model_dump())


@router.post("/logout")
async def logout(
    response: Response, session: dict = Depends(get_session)
) -> ApiResponse:
    await auth_service.logout(session["sid"], session["cookie"])
    clear_session_cookie(response)
    return ok({})
