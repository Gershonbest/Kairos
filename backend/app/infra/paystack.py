"""Paystack HTTP API client for subaccounts, transactions, and verification."""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from app.core.config import get_settings

logger = structlog.get_logger()

PAYSTACK_BASE_URL = "https://api.paystack.co"


class PaystackError(Exception):
    """Raised when a Paystack API call fails."""

    def __init__(self, message: str, *, status_code: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


class PaystackClient:
    """Async client for Paystack REST API operations."""

    def __init__(self, *, base_url: str = PAYSTACK_BASE_URL, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def is_configured(self) -> bool:
        return bool((get_settings().paystack_secret_key or "").strip())

    @staticmethod
    def to_kobo(amount_naira: float) -> int:
        return max(0, int(round(float(amount_naira) * 100)))

    @staticmethod
    def from_kobo(amount_kobo: int | float) -> float:
        return round(float(amount_kobo) / 100.0, 2)

    def _secret_key(self) -> str:
        key = (get_settings().paystack_secret_key or "").strip()
        if not key:
            raise PaystackError("PAYSTACK_SECRET_KEY is not configured")
        return key

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._secret_key()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _request(self, method: str, path: str, *, json: dict | None = None) -> Any:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(method, url, headers=self._headers(), json=json)
        except httpx.HTTPError as exc:
            logger.exception("paystack.request_failed", path=path, method=method)
            raise PaystackError(f"Paystack request failed: {exc}") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise PaystackError(
                f"Paystack returned non-JSON response ({response.status_code})",
                status_code=response.status_code,
            ) from exc

        if response.status_code >= 400 or not payload.get("status"):
            message = payload.get("message") if isinstance(payload, dict) else "Paystack API error"
            logger.warning(
                "paystack.api_error",
                path=path,
                status_code=response.status_code,
                message=message,
            )
            raise PaystackError(str(message), status_code=response.status_code, payload=payload)

        return payload.get("data")

    async def list_banks(self, *, country: str = "nigeria") -> list[dict]:
        data = await self._request("GET", f"/bank?country={country}")
        return list(data or []) if isinstance(data, list) else []

    async def create_subaccount(
        self,
        *,
        business_name: str,
        settlement_bank: str,
        account_number: str,
        percentage_charge: float,
        primary_contact_email: str | None = None,
        primary_contact_name: str | None = None,
    ) -> dict:
        body: dict[str, Any] = {
            "business_name": business_name,
            "settlement_bank": settlement_bank,
            "account_number": account_number,
            "percentage_charge": percentage_charge,
        }
        if primary_contact_email:
            body["primary_contact_email"] = primary_contact_email
        if primary_contact_name:
            body["primary_contact_name"] = primary_contact_name
        data = await self._request("POST", "/subaccount", json=body)
        if not isinstance(data, dict):
            raise PaystackError("Unexpected subaccount response from Paystack")
        return data

    async def initialize_transaction(
        self,
        *,
        email: str,
        amount_naira: float,
        reference: str,
        callback_url: str,
        metadata: dict | None = None,
        subaccount_code: str | None = None,
        currency: str = "NGN",
    ) -> dict:
        body: dict[str, Any] = {
            "email": email,
            "amount": self.to_kobo(amount_naira),
            "reference": reference,
            "callback_url": callback_url,
            "currency": currency,
            "metadata": metadata or {},
        }
        if subaccount_code:
            body["subaccount"] = subaccount_code
            # Main account (Kairos) bears Paystack fees; split uses subaccount percentage_charge.
            body["bearer"] = "account"
        data = await self._request("POST", "/transaction/initialize", json=body)
        if not isinstance(data, dict):
            raise PaystackError("Unexpected initialize response from Paystack")
        return data

    async def verify_transaction(self, reference: str) -> dict:
        data = await self._request("GET", f"/transaction/verify/{reference}")
        if not isinstance(data, dict):
            raise PaystackError("Unexpected verify response from Paystack")
        return data


paystack_client = PaystackClient()
