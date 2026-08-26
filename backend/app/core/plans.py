"""Canonical subscription plan and feature enums.

Default catalog lives in code. Live entitlements are stored on
`subscription_plans` and can be edited from the admin portal. Runtime
enforcement prefers the in-memory catalog hydrated from the database.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass

CATALOG_REVISION = 2


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
    PlanFeature.mobile_booking_page: "Public booking page",
    PlanFeature.payment_processing: "Payment processing",
    PlanFeature.standard_support: "Standard support",
    PlanFeature.ai_assistant: "Orion AI assistant",
    PlanFeature.custom_branding: "Custom branding",
    PlanFeature.priority_support: "Priority support",
    PlanFeature.analytics_dashboard: "Analytics dashboard",
    PlanFeature.multi_location: "Multi-location",
    PlanFeature.white_label: "White-label",
    PlanFeature.dedicated_account_manager: "Dedicated account manager",
    PlanFeature.api_access: "API access",
    PlanFeature.client_reminders_email: "Email booking reminders",
    PlanFeature.client_reminders_sms: "SMS reminders",
    PlanFeature.client_reminders_whatsapp: "WhatsApp reminders",
    PlanFeature.client_reminders_voice: "Voice / AI call reminders",
}


@dataclass(frozen=True)
class PlanCapability:
    key: str
    label: str
    kind: str
    features: tuple[PlanFeature, ...] = ()


ADMIN_CAPABILITIES: tuple[PlanCapability, ...] = (
    PlanCapability("bookings_per_month", "Bookings / month", "limit"),
    PlanCapability("team_members", "Team seats (incl. owner)", "limit"),
    PlanCapability(
        "mobile_booking_page",
        "Public booking page",
        "flag",
        (PlanFeature.mobile_booking_page,),
    ),
    PlanCapability("client_database", "Client database", "flag", (PlanFeature.client_database,)),
    PlanCapability(
        "payment_processing",
        "Payment processing",
        "flag",
        (PlanFeature.payment_processing,),
    ),
    PlanCapability(
        "email_reminders",
        "Email notifications / reminders",
        "flag",
        (PlanFeature.email_notifications, PlanFeature.client_reminders_email),
    ),
    PlanCapability("ai_assistant", "Orion AI assistant", "flag", (PlanFeature.ai_assistant,)),
    PlanCapability("custom_branding", "Custom branding", "flag", (PlanFeature.custom_branding,)),
    PlanCapability(
        "analytics_dashboard",
        "Analytics dashboard",
        "flag",
        (PlanFeature.analytics_dashboard,),
    ),
    PlanCapability(
        "client_reminders_sms",
        "SMS reminders",
        "flag",
        (PlanFeature.client_reminders_sms,),
    ),
    PlanCapability(
        "client_reminders_whatsapp",
        "WhatsApp reminders",
        "flag",
        (PlanFeature.client_reminders_whatsapp,),
    ),
    PlanCapability("multi_location", "Multi-location", "flag", (PlanFeature.multi_location,)),
    PlanCapability("white_label", "White-label", "flag", (PlanFeature.white_label,)),
    PlanCapability(
        "client_reminders_voice",
        "Voice / AI call reminders",
        "flag",
        (PlanFeature.client_reminders_voice,),
    ),
    PlanCapability("self_serve", "Self-serve checkout", "flag"),
)

ADMIN_FLAG_KEYS = {cap.key for cap in ADMIN_CAPABILITIES if cap.kind == "flag"}


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
        seen: set[str] = set()
        for feature in self.features:
            if feature == PlanFeature.bookings:
                label = (
                    "Unlimited bookings"
                    if self.bookings_per_month is None
                    else f"Up to {self.bookings_per_month} bookings/month"
                )
            elif feature == PlanFeature.team_members:
                if self.team_members is None:
                    label = "Unlimited team seats"
                elif self.team_members == 1:
                    label = "1 team seat (owner only)"
                else:
                    label = f"Up to {self.team_members} team seats"
            elif feature == PlanFeature.email_notifications:
                continue
            else:
                label = PLAN_FEATURE_LABELS[feature]
            if label in seen:
                continue
            seen.add(label)
            labels.append(label)
        return labels

    def entitlements(self) -> dict:
        return {
            "bookings_per_month": self.bookings_per_month,
            "team_members": self.team_members,
            PlanFeature.ai_assistant.value: self.has(PlanFeature.ai_assistant),
            PlanFeature.custom_branding.value: self.has(PlanFeature.custom_branding),
            PlanFeature.payment_processing.value: self.has(PlanFeature.payment_processing),
            PlanFeature.analytics_dashboard.value: self.has(PlanFeature.analytics_dashboard),
            PlanFeature.api_access.value: self.has(PlanFeature.api_access),
            PlanFeature.white_label.value: self.has(PlanFeature.white_label),
            PlanFeature.multi_location.value: self.has(PlanFeature.multi_location),
            PlanFeature.client_reminders_email.value: self.has(PlanFeature.client_reminders_email),
            PlanFeature.client_reminders_sms.value: self.has(PlanFeature.client_reminders_sms),
            PlanFeature.client_reminders_whatsapp.value: self.has(PlanFeature.client_reminders_whatsapp),
            PlanFeature.client_reminders_voice.value: self.has(PlanFeature.client_reminders_voice),
        }

    def seed_dict(self) -> dict:
        entitlements = self.entitlements()
        entitlements["_revision"] = CATALOG_REVISION
        return {
            "code": self.code.value,
            "name": self.name,
            "monthly_price": self.monthly_price,
            "description": self.description,
            "features": self.feature_codes(),
            "entitlements": entitlements,
            "self_serve": self.self_serve,
            "is_active": self.is_active,
            "is_featured": self.is_featured,
            "sort_order": self.sort_order,
        }

    def contact_admin(self) -> bool:
        return (not self.self_serve) or self.monthly_price <= 0


def features_from_flags(flags: dict[str, bool]) -> tuple[PlanFeature, ...]:
    ordered: list[PlanFeature] = [PlanFeature.bookings, PlanFeature.team_members]
    for capability in ADMIN_CAPABILITIES:
        if capability.kind != "flag" or capability.key == "self_serve":
            continue
        if flags.get(capability.key):
            ordered.extend(capability.features)
    return tuple(dict.fromkeys(ordered))


def capability_flags(definition: PlanDefinition) -> dict[str, bool]:
    flags: dict[str, bool] = {}
    for capability in ADMIN_CAPABILITIES:
        if capability.kind != "flag":
            continue
        if capability.key == "self_serve":
            flags[capability.key] = definition.self_serve
            continue
        flags[capability.key] = any(definition.has(feature) for feature in capability.features)
    return flags


def catalog_capabilities() -> list[dict]:
    return [{"key": cap.key, "label": cap.label, "kind": cap.kind} for cap in ADMIN_CAPABILITIES]


def _parse_feature(value: object) -> PlanFeature | None:
    if isinstance(value, PlanFeature):
        return value
    try:
        return PlanFeature(str(value))
    except ValueError:
        return None


def definition_from_row(plan: object) -> PlanDefinition:
    """Rebuild a plan definition from a `subscription_plans` row."""
    code = coerce_plan_code(getattr(plan, "code", None))
    parsed = [feature for feature in (_parse_feature(raw) for raw in (getattr(plan, "features", None) or [])) if feature]
    entitlements = dict(getattr(plan, "entitlements", None) or {})
    fallback = PLAN_CATALOG[code]
    if not parsed:
        parsed = list(fallback.features)
    bookings = entitlements.get("bookings_per_month", fallback.bookings_per_month)
    team = entitlements.get("team_members", fallback.team_members)
    return PlanDefinition(
        code=code,
        name=str(getattr(plan, "name", None) or fallback.name),
        monthly_price=float(getattr(plan, "monthly_price", None) or 0),
        description=str(getattr(plan, "description", None) or fallback.description),
        features=tuple(parsed),
        bookings_per_month=int(bookings) if bookings is not None else None,
        team_members=int(team) if team is not None else None,
        self_serve=bool(getattr(plan, "self_serve", fallback.self_serve)),
        is_featured=bool(getattr(plan, "is_featured", fallback.is_featured)),
        sort_order=int(getattr(plan, "sort_order", None) or fallback.sort_order),
        is_active=bool(getattr(plan, "is_active", True)),
    )


_STANDARD_FEATURES = (
    PlanFeature.bookings,
    PlanFeature.team_members,
    PlanFeature.email_notifications,
    PlanFeature.client_database,
    PlanFeature.mobile_booking_page,
    PlanFeature.payment_processing,
    PlanFeature.client_reminders_email,
    PlanFeature.custom_branding,
    PlanFeature.analytics_dashboard,
)

_PREMIUM_FEATURES = _STANDARD_FEATURES + (
    PlanFeature.ai_assistant,
    PlanFeature.client_reminders_sms,
    PlanFeature.client_reminders_whatsapp,
    PlanFeature.multi_location,
)

_ENTERPRISE_FEATURES = _PREMIUM_FEATURES + (
    PlanFeature.white_label,
    PlanFeature.client_reminders_voice,
)

PLAN_CATALOG: dict[PlanCode, PlanDefinition] = {
    PlanCode.standard: PlanDefinition(
        code=PlanCode.standard,
        name="Standard",
        monthly_price=10000.0,
        description="Solo practitioners getting started",
        features=_STANDARD_FEATURES,
        bookings_per_month=150,
        team_members=1,
        self_serve=True,
        is_featured=False,
        sort_order=1,
    ),
    PlanCode.premium: PlanDefinition(
        code=PlanCode.premium,
        name="Premium",
        monthly_price=25000.0,
        description="Growing businesses + AI",
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
        monthly_price=0.0,
        description="Custom and white-label",
        features=_ENTERPRISE_FEATURES,
        bookings_per_month=None,
        team_members=None,
        self_serve=False,
        is_featured=False,
        sort_order=3,
    ),
}

_runtime_catalog: dict[PlanCode, PlanDefinition] | None = None


def set_runtime_catalog(definitions: dict[PlanCode, PlanDefinition] | None) -> None:
    global _runtime_catalog
    _runtime_catalog = definitions


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
    code = coerce_plan_code(value)
    if _runtime_catalog and code in _runtime_catalog:
        return _runtime_catalog[code]
    return PLAN_CATALOG[code]


def plan_has_feature(value: PlanCode | str | None, feature: PlanFeature) -> bool:
    return plan_definition(value).has(feature)


async def load_plan_definition(session, value: PlanCode | str | None) -> PlanDefinition:
    from sqlalchemy import select

    from app.infra.models import SubscriptionPlan

    code = coerce_plan_code(value)
    plan = (
        await session.execute(select(SubscriptionPlan).where(SubscriptionPlan.code == code))
    ).scalar_one_or_none()
    if plan is None:
        return PLAN_CATALOG[code]
    definition = definition_from_row(plan)
    catalog = dict(_runtime_catalog or {})
    catalog[code] = definition
    set_runtime_catalog(catalog)
    return definition


async def hydrate_runtime_catalog(session) -> None:
    from sqlalchemy import select

    from app.infra.models import SubscriptionPlan

    rows = (await session.execute(select(SubscriptionPlan))).scalars().all()
    if not rows:
        return
    set_runtime_catalog({coerce_plan_code(plan.code): definition_from_row(plan) for plan in rows})
