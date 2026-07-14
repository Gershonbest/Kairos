"""S3 and local file storage for tenant assets."""

from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path

import structlog
from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

logger = structlog.get_logger()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def _extension_for(content_type: str) -> str:
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    return mapping.get(content_type, mimetypes.guess_extension(content_type) or ".bin")


async def _read_upload(file: UploadFile) -> tuple[bytes, str]:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be 5MB or smaller")
    return data, file.content_type or "application/octet-stream"


def _upload_to_s3(*, key: str, data: bytes, content_type: str) -> str:
    settings = get_settings()
    if not settings.s3_bucket_name:
        raise RuntimeError("S3 bucket not configured")

    import boto3

    client = boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
    )
    put_kwargs: dict = {
        "Bucket": settings.s3_bucket_name,
        "Key": key,
        "Body": data,
        "ContentType": content_type,
        "CacheControl": "public, max-age=31536000, immutable",
    }
    if settings.s3_object_acl:
        put_kwargs["ACL"] = settings.s3_object_acl

    client.put_object(**put_kwargs)
    if settings.s3_public_base_url:
        return f"{settings.s3_public_base_url.rstrip('/')}/{key}"
    return f"https://{settings.s3_bucket_name}.s3.{settings.aws_region}.amazonaws.com/{key}"


def _upload_to_local(*, key: str, data: bytes) -> str:
    settings = get_settings()
    root = Path(settings.local_upload_dir)
    destination = root / key
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return f"{settings.media_base_url.rstrip('/')}/{key}"


async def upload_tenant_image(*, tenant_id: str, folder: str, file: UploadFile) -> str:
    data, content_type = await _read_upload(file)
    extension = _extension_for(content_type)
    key = f"tenants/{tenant_id}/{folder}/{uuid.uuid4().hex}{extension}"
    settings = get_settings()

    if settings.s3_bucket_name:
        try:
            url = _upload_to_s3(key=key, data=data, content_type=content_type)
            logger.info("storage.s3_upload", key=key)
            return url
        except Exception as exc:
            logger.exception("storage.s3_upload_failed", key=key)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to upload image to storage",
            ) from exc

    if settings.app_env == "production":
        logger.error("storage.s3_not_configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is not configured",
        )

    logger.info("storage.local_upload", key=key)
    return _upload_to_local(key=key, data=data)
