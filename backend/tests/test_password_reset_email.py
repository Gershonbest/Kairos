"""Password reset email helper."""

from unittest.mock import patch

from app.modules.notifications.service import send_password_reset_email


def test_send_password_reset_email_includes_link():
    with patch("app.modules.notifications.service.email_service") as email_service:
        send_password_reset_email(
            to="owner@example.com",
            full_name="Ada Lovelace",
            reset_url="https://app.example/auth/reset-password?token=abc",
            expire_hours=1,
        )
        email_service.send.assert_called_once()
        kwargs = email_service.send.call_args.kwargs
        assert kwargs["to"] == "owner@example.com"
        assert "Reset your Kairos Bookings password" in kwargs["subject"]
        assert "https://app.example/auth/reset-password?token=abc" in kwargs["html_body"]
        assert "1 hour" in kwargs["text_body"]
