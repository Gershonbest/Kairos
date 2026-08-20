"""Channel adapters for booking reminders (email real; SMS/WhatsApp/voice stubbed)."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape

import structlog

from app.core.config import get_settings
from app.infra.email import EmailDeliveryError, email_service
from app.infra.models import OutboundChannel

logger = structlog.get_logger()


@dataclass(frozen=True)
class ProviderResult:
    ok: bool
    provider: str
    skipped: bool = False
    skip_reason: str | None = None
    message_id: str | None = None
    error: str | None = None


class EmailAdapter:
    provider_name = "email"

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult:
        subject = str(metadata.get("subject") or "Booking reminder")
        html = f"<p>{escape(body)}</p>"
        try:
            if not email_service.is_configured():
                settings = get_settings()
                if settings.messaging_dry_run or settings.app_env == "dev":
                    logger.info("messaging.email_dry_run", to=to, subject=subject)
                    return ProviderResult(ok=True, provider="email-stub")
                return ProviderResult(
                    ok=True,
                    provider="email",
                    skipped=True,
                    skip_reason="not_configured",
                )
            email_service.send(to=to, subject=subject, html_body=html, text_body=body)
            return ProviderResult(ok=True, provider=getattr(email_service, "provider_name", "email"))
        except EmailDeliveryError as exc:
            return ProviderResult(ok=False, provider="email", error=str(exc))
        except Exception as exc:
            logger.exception("messaging.email_failed", to=to)
            return ProviderResult(ok=False, provider="email", error=str(exc))


class StubChannelAdapter:
    """SMS/WhatsApp until a real provider is wired; voice stays skipped."""

    def __init__(self, channel: OutboundChannel, *, always_skip: bool = False):
        self.channel = channel
        self.always_skip = always_skip
        self.provider_name = "stub"

    def send(self, *, to: str, body: str, metadata: dict) -> ProviderResult:
        if self.always_skip:
            logger.info(
                "messaging.channel_not_configured",
                channel=self.channel.value,
                to=to,
            )
            return ProviderResult(
                ok=True,
                provider="stub",
                skipped=True,
                skip_reason="not_configured",
            )
        settings = get_settings()
        if settings.messaging_dry_run:
            logger.info(
                "messaging.stub_sent",
                channel=self.channel.value,
                to=to,
                template=metadata.get("template_key"),
            )
            return ProviderResult(ok=True, provider="stub", message_id="stub")
        return ProviderResult(
            ok=True,
            provider="stub",
            skipped=True,
            skip_reason="not_configured",
        )


_ADAPTERS = {
    OutboundChannel.email: EmailAdapter(),
    OutboundChannel.sms: StubChannelAdapter(OutboundChannel.sms),
    OutboundChannel.whatsapp: StubChannelAdapter(OutboundChannel.whatsapp),
    OutboundChannel.voice: StubChannelAdapter(OutboundChannel.voice, always_skip=True),
}


def get_adapter(channel: OutboundChannel) -> EmailAdapter | StubChannelAdapter:
    return _ADAPTERS[channel]
