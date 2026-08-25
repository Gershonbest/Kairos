"""Extract text from uploaded knowledge documents (PDF / TXT / MD)."""

from __future__ import annotations

from io import BytesIO


class ExtractError(ValueError):
    pass


def extract_text_from_bytes(*, data: bytes, content_type: str, filename: str = "") -> str:
    lowered = (content_type or "").lower().strip()
    name = (filename or "").lower()

    if lowered in {"text/plain", "text/markdown"} or name.endswith((".txt", ".md", ".markdown")):
        return _decode_text(data)

    if lowered == "application/pdf" or name.endswith(".pdf"):
        return _extract_pdf(data)

    raise ExtractError("Unsupported file type. Upload PDF, TXT, or Markdown.")


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ExtractError("Could not decode text file")
    cleaned = text.strip()
    if not cleaned:
        raise ExtractError("File has no extractable text")
    return cleaned


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ExtractError("PDF support is not installed on the server") from exc

    try:
        reader = PdfReader(BytesIO(data))
    except Exception as exc:
        raise ExtractError("Could not read PDF file") from exc

    parts: list[str] = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        if page_text.strip():
            parts.append(page_text.strip())

    text = "\n\n".join(parts).strip()
    if not text:
        raise ExtractError("No extractable text (scanned PDFs are not supported)")
    return text
