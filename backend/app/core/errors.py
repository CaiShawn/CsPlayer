from fastapi import HTTPException


class AppError(Exception):
    def __init__(self, code: int, message: str, http_status: int = 400):
        self.code = code
        self.message = message
        self.http_status = http_status
        super().__init__(message)


def unauthorized(message: str = "未登录") -> HTTPException:
    return HTTPException(status_code=401, detail={"code": 1001, "message": message})


def not_found(message: str = "资源不存在") -> HTTPException:
    return HTTPException(status_code=404, detail={"code": 2001, "message": message})


def bad_gateway(message: str = "上游服务失败") -> HTTPException:
    return HTTPException(status_code=502, detail={"code": 5001, "message": message})


def rate_limited(message: str = "操作频繁，请稍候再试") -> HTTPException:
    return HTTPException(status_code=429, detail={"code": 4290, "message": message})
