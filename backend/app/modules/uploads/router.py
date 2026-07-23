"""Authenticated image upload endpoints."""

from fastapi import APIRouter, Depends, File, UploadFile

from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.storage import object_storage

router = APIRouter(dependencies=[Depends(require_active_subscription)])


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    if not current_user.tenant_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="No tenant assigned")
    url = await object_storage.upload_tenant_image(tenant_id=current_user.tenant_id, folder="logos", file=file)
    return {"url": url}


@router.post("/service-image")
async def upload_service_image(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    if not current_user.tenant_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="No tenant assigned")
    url = await object_storage.upload_tenant_image(tenant_id=current_user.tenant_id, folder="services", file=file)
    return {"url": url}
