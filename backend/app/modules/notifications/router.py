"""Tenant notification preference endpoints."""

from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, get_current_user

router = APIRouter()


@router.get("/preferences")
async def get_notification_preferences(
    _: CurrentUser = Depends(get_current_user),
) -> dict:
    return {"email": True, "sms": False}
