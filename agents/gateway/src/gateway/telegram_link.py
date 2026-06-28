"""Internal Telegram account-linking endpoint."""

from agents_shared.dependencies import AgentServicesDep
from agents_shared.telegram_auth import check_link_secret, consume_link_token
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/telegram")


class ConsumeTelegramLinkRequest(BaseModel):
    token: str
    clerk_user_id: str


@router.post("/link/consume")
async def consume_telegram_link(
    body: ConsumeTelegramLinkRequest,
    services: AgentServicesDep,
    x_telegram_link_secret: str | None = Header(default=None),
) -> dict[str, object]:
    if not check_link_secret(x_telegram_link_secret):
        raise HTTPException(status_code=401, detail="Invalid link secret")

    link = await consume_link_token(
        services.engine,
        token=body.token,
        clerk_user_id=body.clerk_user_id,
    )
    if link is None:
        raise HTTPException(status_code=400, detail="Invalid or expired link token")

    return {"ok": True, "telegram_user_id": link.telegram_user_id}
