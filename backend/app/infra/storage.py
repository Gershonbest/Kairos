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
ALLOWED_KNOWLEDGE_TYPES = {
    "application/pdf",
    "text/plain",
    "text/markdown",
    "text/x-markdown",
}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_KNOWLEDGE_UPLOAD_BYTES = 10 * 1024 * 1024


class ObjectStorage:
    """Upload tenant images to S3, with local disk fallback in non-production."""

    def __init__(
        self,
        *,
        allowed_image_types: set[str] | None = None,
        max_upload_bytes: int = MAX_UPLOAD_BYTES,
    ):
        self.allowed_image_types = allowed_image_types or set(ALLOWED_IMAGE_TYPES)
        self.max_upload_bytes = max_upload_bytes

    def _extension_for(self, content_type: str) -> str:
        mapping = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }
        return mapping.get(content_type, mimetypes.guess_extension(content_type) or ".bin")

    async def _read_upload(self, file: UploadFile) -> tuple[bytes, str]:
        if file.content_type not in self.allowed_image_types:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image type")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
        if len(data) > self.max_upload_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be 5MB or smaller")
        return data, file.content_type or "application/octet-stream"

    def _upload_to_s3(self, *, key: str, data: bytes, content_type: str) -> str:
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

    def _upload_to_local(self, *, key: str, data: bytes) -> str:
        settings = get_settings()
        root = Path(settings.local_upload_dir)
        destination = root / key
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        return f"{settings.media_base_url.rstrip('/')}/{key}"

    async def upload_tenant_image(self, *, tenant_id: str, folder: str, file: UploadFile) -> str:
        data, content_type = await self._read_upload(file)
        extension = self._extension_for(content_type)
        key = f"tenants/{tenant_id}/{folder}/{uuid.uuid4().hex}{extension}"
        settings = get_settings()

        if settings.s3_bucket_name:
            try:
                url = self._upload_to_s3(key=key, data=data, content_type=content_type)
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
        return self._upload_to_local(key=key, data=data)

    def _guess_knowledge_type(self, file: UploadFile) -> str:
        content_type = (file.content_type or "").lower().strip()
        filename = (file.filename or "").lower()
        if content_type in ALLOWED_KNOWLEDGE_TYPES:
            return content_type
        if filename.endswith(".pdf"):
            return "application/pdf"
        if filename.endswith(".md") or filename.endswith(".markdown"):
            return "text/markdown"
        if filename.endswith(".txt"):
            return "text/plain"
        return content_type

    def _extension_for_knowledge(self, content_type: str, filename: str = "") -> str:
        name = (filename or "").lower()
        if name.endswith(".pdf") or content_type == "application/pdf":
            return ".pdf"
        if name.endswith(".md") or name.endswith(".markdown") or "markdown" in content_type:
            return ".md"
        if name.endswith(".txt") or content_type == "text/plain":
            return ".txt"
        return mimetypes.guess_extension(content_type) or ".bin"

    async def upload_tenant_knowledge_file(
        self, *, tenant_id: str, file: UploadFile
    ) -> tuple[str, bytes, str, int]:
        """Store a knowledge document. Returns (url, raw_bytes, content_type, byte_size)."""
        content_type = self._guess_knowledge_type(file)
        if content_type not in ALLOWED_KNOWLEDGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported file type. Upload PDF, TXT, or Markdown.",
            )
        data = await file.read()
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
        if len(data) > MAX_KNOWLEDGE_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be 10MB or smaller",
            )
        extension = self._extension_for_knowledge(content_type, file.filename or "")
        key = f"tenants/{tenant_id}/knowledge/{uuid.uuid4().hex}{extension}"
        settings = get_settings()

        if settings.s3_bucket_name:
            try:
                url = self._upload_to_s3(key=key, data=data, content_type=content_type)
                logger.info("storage.s3_knowledge_upload", key=key)
                return url, data, content_type, len(data)
            except Exception as exc:
                logger.exception("storage.s3_knowledge_upload_failed", key=key)
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Unable to upload document to storage",
                ) from exc

        if settings.app_env == "production":
            logger.error("storage.s3_not_configured")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Object storage is not configured",
            )

        logger.info("storage.local_knowledge_upload", key=key)
        return self._upload_to_local(key=key, data=data), data, content_type, len(data)


object_storage = ObjectStorage()
