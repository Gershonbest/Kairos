"""Canonical subscription plan and feature enums.

Plans and feature flags live in code, not in the admin UI. Tenant.plan_code and
subscription_plans.code persist PlanCode values. Feature lists persist PlanFeature
values. Marketing copy is derived from the catalog for public APIs.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass


class PlanCode(str, enum.Enum):
    standard = "standard"
    premium = "premium"
    enterprise = "enterprise"


class PlanFeature(str, enum.Enum):
    bookings = "bookings"
    team_members = "team_members"
    email_notifications = "email_notifications"
    client_database = "client_database"
    mobile_booking_page = "mobile_booking_page"
    payment_processing = "payment_processing"
    standard_support = "standard_support"
    ai_assistant = "ai_assistant"
    custom_branding = "custom_branding"
    priority_support = "priority_support"
    analytics_dashboard = "analytics_dashboard"
    multi_location = "multi_location"
    white_label = "white_label"
    dedicated_account_manager = "dedicated_account_manager"
    api_access = "api_access"
    client_reminders_email = "client_reminders_email"
    client_reminders_sms = "client_reminders_sms"
    client_reminders_whatsapp = "client_reminders_whatsapp"
    client_reminders_voice = "client_reminders_voice"


PLAN_FEATURE_LABELS: dict[PlanFeature, str] = {
    PlanFeature.bookings: "Bookings",
    PlanFeature.team_members: "Team members",
    PlanFeature.email_notifications: "Email notifications",
    PlanFeature.client_database: "Client database",
    PlanFeature.mobile_booking_page: "Mobile booking page",
    PlanFeature.payment_processing: "Payment processing",
    PlanFeature.standard_support: "Standard support",
    PlanFeature.ai_assistant: "AI booking assistant",
    PlanFeature.custom_branding: "Custom branding",
    PlanFeature.priority_support: "Priority support",
    PlanFeature.analytics_dashboard: "Analytics dashboard",
    PlanFeature.multi_location: "Multi-location support",
    PlanFeature.white_label: "White-label options",
    PlanFeature.dedicated_account_manager: "Dedicated account manager",
    PlanFeature.api_access: "API access",
    PlanFeature.client_reminders_email: "Email booking reminders",
    PlanFeature.client_reminders_sms: "SMS booking reminders",
    PlanFeature.client_reminders_whatsapp: "WhatsApp booking reminders",
    PlanFeature.client_reminders_voice: "AI call reminders",
}


@dataclass(frozen=True)
class PlanDefinition:
    code: PlanCode
    name: str
    monthly_price: float
    description: str
    features: tuple[PlanFeature, ...]
    bookings_per_month: int | None
    team_members: int | None
    self_serve: bool
    is_featured: bool
    sort_order: int
    is_active: bool = True

    def has(self, feature: PlanFeature) -> bool:
        return feature in self.features

    def feature_codes(self) -> list[str]:
        return [feature.value for feature in self.features]

    def feature_labels(self) -> list[str]:
        labels: list[str] = []
        for feature in self.features:
            if feature == PlanFeature.bookings:
                labels.append(
                    "Unlimited bookings"
                    if self.bookings_per_month is None
                    else f"Up to {self.bookings_per_month} bookings/month"
                )
            elif feature == PlanFeature.team_members:
                if self.team_members is None:
                    labels.append("Unlimited team members")
                elif self.team_members == 1:
                    labels.append("1 team member")
                else:
                    labels.append(f"Up to {self.team_members} team members")
            else:
                labels.append(PLAN_FEATURE_LABELS[feature])
        return labels

    def entitlements(self) -> dict:
        return {
            "bookings_per_month": self.bookings_per_month,
            "team_members": self.team_members,
            PlanFeature.ai_assistant.value: self.has(PlanFeature.ai_assistant),
            PlanFeature.custom_branding.value: self.has(PlanFeature.custom_branding),
            PlanFeature.payment_processing.value: self.has(PlanFeature.payment_processing),
            PlanFeature.api_access.value: self.has(PlanFeature.api_access),
            PlanFeature.white_label.value: self.has(PlanFeature.white_label),
            PlanFeature.multi_location.value: self.has(PlanFeature.multi_location),
            PlanFeature.client_reminders_email.value: self.has(PlanFeature.client_reminders_email),
            PlanFeature.client_reminders_sms.value: self.has(PlanFeature.client_reminders_sms),
            PlanFeature.client_reminders_whatsapp.value: self.has(PlanFeature.client_reminders_whatsapp),
            PlanFeature.client_reminders_voice.value: self.has(PlanFeature.client_reminders_voice),
        }

    def seed_dict(self) -> dict:
        return {
            "code": self.code.value,
            "name": self.name,
            "monthly_price": self.monthly_price,
            "description": self.description,
            "features": self.feature_codes(),
            "entitlements": self.entitlements(),
            "self_serve": self.self_serve,
            "is_active": self.is_active,
            "is_featured": self.is_featured,
            "sort_order": self.sort_order,
        }


_STANDARD_FEATURES = (
    PlanFeature.bookings,
    PlanFeature.team_members,
    PlanFeature.email_notifications,
    PlanFeature.client_database,
    PlanFeature.mobile_booking_page,
    PlanFeature.payment_processing,
    PlanFeature.client_reminders_email,
    PlanFeature.standard_support,
)

_PREMIUM_FEATURES = _STANDARD_FEATURES + (
    PlanFeature.ai_assistant,
    PlanFeature.custom_branding,
    PlanFeature.priority_support,
    PlanFeature.analytics_dashboard,
    PlanFeature.client_reminders_sms,
    PlanFeature.client_reminders_whatsapp,
)

_ENTERPRISE_FEATURES = _PREMIUM_FEATURES + (
    PlanFeature.multi_location,
    PlanFeature.white_label,
    PlanFeature.dedicated_account_manager,
    PlanFeature.api_access,
    PlanFeature.client_reminders_voice,
)

PLAN_CATALOG: dict[PlanCode, PlanDefinition] = {
    PlanCode.standard: PlanDefinition(
        code=PlanCode.standard,
        name="Standard",
        monthly_price=15000.0,
        description="Perfect for solo practitioners and small teams getting started",
        features=_STANDARD_FEATURES,
        bookings_per_month=100,
        team_members=1,
        self_serve=True,
        is_featured=False,
        sort_order=1,
    ),
    PlanCode.premium: PlanDefinition(
        code=PlanCode.premium,
        name="Premium",
        monthly_price=45000.0,
        description="For growing businesses that need advanced features and AI",
        features=_PREMIUM_FEATURES,
        bookings_per_month=None,
        team_members=5,
        self_serve=True,
        is_featured=True,
        sort_order=2,
    ),
    PlanCode.enterprise: PlanDefinition(
        code=PlanCode.enterprise,
        name="Enterprise",
        monthly_price=120000.0,
        description="Complete solution for multi-location businesses",
        features=_ENTERPRISE_FEATURES,
        bookings_per_month=None,
        team_members=None,
        self_serve=False,
        is_featured=False,
        sort_order=3,
    ),
}


def coerce_plan_code(value: PlanCode | str | None, *, default: PlanCode | None = PlanCode.standard) -> PlanCode:
    if isinstance(value, PlanCode):
        return value
    if value is None or str(value).strip() == "":
        if default is None:
            raise ValueError("Unknown subscription plan")
        return default
    try:
        return PlanCode(str(value).strip().lower())
    except ValueError as exc:
        if default is None:
            raise ValueError("Unknown subscription plan") from exc
        return default


def require_plan_code(value: PlanCode | str | None) -> PlanCode:
    return coerce_plan_code(value, default=None)


def plan_code_value(value: PlanCode | str | None) -> str:
    return coerce_plan_code(value).value


def plan_definition(value: PlanCode | str | None) -> PlanDefinition:
    return PLAN_CATALOG[coerce_plan_code(value)]


def plan_has_feature(value: PlanCode | str | None, feature: PlanFeature) -> bool:
    return plan_definition(value).has(feature)
