"""Client communication logging tests."""

from app.modules.clients.communications import truncate_summary


def test_truncate_summary() -> None:
    assert truncate_summary("short") == "short"
    long_text = "x" * 600
    result = truncate_summary(long_text)
    assert result is not None
    assert len(result) <= 500
    assert result.endswith("…")
