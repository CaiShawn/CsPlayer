from pydantic import BaseModel


class UserProfile(BaseModel):
    userId: int
    nickname: str
    avatarUrl: str = ""
    signature: str = ""
