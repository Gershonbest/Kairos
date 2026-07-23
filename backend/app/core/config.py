"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Kairos Bookings API"
    app_env: str = "dev"
    app_debug: bool = False
    database_url: str = "sqlite+aiosqlite:///./kairos.db"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-me"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    allowed_origins: str = "http://localhost:5173"
    allowed_origin_regex: str | None = r"https://.*\.ngrok(-free)?\.app"

    @field_validator("allowed_origin_regex")
    @classmethod
    def normalize_allowed_origin_regex(cls, value: str | None) -> str | None:
        if not value:
            return value
        # .env files often double-escape backslashes, breaking the ngrok host pattern.
        return value.replace(r"\\.", r"\.").replace("\\\\", "\\")
    payment_webhook_secret: str = ""
    paystack_secret_key: str | None = None
    paystack_public_key: str | None = None
    # Prefer Paystack secret key for webhook HMAC; falls back to payment_webhook_secret.
    paystack_webhook_secret: str | None = None
    paystack_platform_fee_percent: float = 5.0
    paystack_callback_base_url: str | None = None
    # Comma-separated checkout channels. Empty = Paystack dashboard defaults.
    # OPay and other bank apps appear under "bank". Example:
    # card,bank,ussd,bank_transfer,qr,mobile_money
    paystack_channels: str = "card,bank,ussd,bank_transfer,qr"
    otel_exporter_otlp_endpoint: str | None = None
    public_booking_base_url: str = "http://localhost:5173/book"
    frontend_base_url: str = "http://localhost:5173"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "noreply@kairosbookings.com"
    smtp_from_name: str = "Kairos Bookings"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout: int = 60
    brevo_api_key: str | None = None
    # Gmail SMTP (Google account + app password). See:
    # https://myaccount.google.com/apppasswords
    google_gmail_sender: str | None = None
    google_gmail_app_password: str | None = None
    email_verification_required: bool = True
    email_verification_token_expire_hours: int = 24
    google_client_id: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str = "us-east-1"
    s3_bucket_name: str | None = None
    s3_public_base_url: str | None = None
    # Optional object ACL (e.g. "public-read"). Leave empty for buckets with ACLs disabled;
    # make objects public via bucket policy instead and set S3_PUBLIC_BASE_URL.
    s3_object_acl: str | None = None
    local_upload_dir: str = "uploads"
    media_base_url: str = "http://localhost:8000/media"
    super_admin_email: str = "admin@kairosbookings.com"
    super_admin_password: str = "Admin123!"
    super_admin_name: str = "System Admin"
    trial_days: int = 7
    trial_warning_days: int = 2

    @field_validator("allowed_origins")
    @classmethod
    def trim_allowed_origins(cls, value: str) -> str:
        return ",".join([part.strip() for part in value.split(",") if part.strip()])


@lru_cache
def get_settings() -> Settings:
    return Settings()
