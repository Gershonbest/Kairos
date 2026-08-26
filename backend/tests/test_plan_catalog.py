"""Plan catalog enums are the source of truth for default features and entitlements."""

from types import SimpleNamespace

from app.core.plans import (
    PLAN_CATALOG,
    PlanCode,
    PlanFeature,
    capability_flags,
    coerce_plan_code,
    definition_from_row,
    features_from_flags,
    plan_definition,
    plan_has_feature,
    require_plan_code,
)
from app.modules.subscriptions.service import apply_admin_plan_update, serialize_plan


def test_plan_codes_are_fixed_enums() -> None:
    assert {code.value for code in PlanCode} == {"standard", "premium", "enterprise"}
    assert set(PLAN_CATALOG) == set(PlanCode)


def test_standard_packaging_matches_catalog() -> None:
    standard = plan_definition(PlanCode.standard)
    assert standard.monthly_price == 10000
    assert standard.bookings_per_month == 150
    assert standard.team_members == 1
    assert PlanFeature.payment_processing in standard.features
    assert PlanFeature.client_reminders_email in standard.features
    assert PlanFeature.custom_branding in standard.features
    assert PlanFeature.analytics_dashboard in standard.features
    assert not plan_has_feature(PlanCode.standard, PlanFeature.ai_assistant)
    assert not plan_has_feature(PlanCode.standard, PlanFeature.client_reminders_sms)
    assert not plan_has_feature(PlanCode.standard, PlanFeature.multi_location)


def test_premium_and_enterprise_feature_sets() -> None:
    premium = plan_definition("premium")
    assert premium.monthly_price == 25000
    assert premium.team_members == 5
    assert plan_has_feature("premium", PlanFeature.ai_assistant)
    assert plan_has_feature("premium", PlanFeature.client_reminders_whatsapp)
    assert plan_has_feature("premium", PlanFeature.multi_location)
    assert not plan_has_feature("premium", PlanFeature.white_label)
    assert plan_has_feature(PlanCode.enterprise, PlanFeature.white_label)
    assert plan_has_feature(PlanCode.enterprise, PlanFeature.client_reminders_voice)
    assert plan_definition(PlanCode.enterprise).contact_admin()
    assert not plan_definition(PlanCode.enterprise).self_serve


def test_serialize_plan_returns_enum_feature_codes() -> None:
    plan = type("Plan", (), {"id": "1", "code": PlanCode.premium})()
    payload = serialize_plan(plan, include_admin_fields=True)
    assert payload["code"] == "premium"
    assert "ai_assistant" in payload["feature_codes"]
    assert payload["entitlements"]["ai_assistant"] is True
    assert payload["monthly_price"] == 25000
    assert "Orion AI assistant" in payload["features"]


def test_serialize_plan_uses_stored_row() -> None:
    plan = SimpleNamespace(
        id="1",
        code=PlanCode.standard,
        name="Standard",
        monthly_price=10000,
        description="Solo",
        features=["bookings", "team_members", "ai_assistant", "custom_branding"],
        entitlements={"bookings_per_month": 150, "team_members": 1, "ai_assistant": True},
        self_serve=True,
        is_featured=False,
        is_active=True,
        sort_order=1,
    )
    payload = serialize_plan(plan, include_admin_fields=True)
    assert payload["flags"]["ai_assistant"] is True
    assert payload["flags"]["custom_branding"] is True
    assert "ai_assistant" in payload["feature_codes"]


def test_admin_flags_rebuild_features() -> None:
    flags = capability_flags(plan_definition(PlanCode.premium))
    assert flags["ai_assistant"] is True
    assert flags["white_label"] is False
    flags["white_label"] = True
    rebuilt = features_from_flags(flags)
    assert PlanFeature.white_label in rebuilt
    assert PlanFeature.ai_assistant in rebuilt


def test_apply_admin_plan_update_marks_admin_managed() -> None:
    plan = SimpleNamespace(
        code=PlanCode.standard,
        name="Standard",
        monthly_price=10000,
        description="old",
        features=[],
        entitlements={},
        self_serve=True,
        is_featured=False,
        is_active=True,
        sort_order=1,
    )
    update = SimpleNamespace(
        code=PlanCode.standard,
        name="Standard",
        description="Solo practitioners getting started",
        monthly_price=12000,
        self_serve=True,
        is_featured=False,
        is_active=True,
        bookings_per_month=150,
        team_members=1,
        flags={
            "mobile_booking_page": True,
            "client_database": True,
            "payment_processing": True,
            "email_reminders": True,
            "ai_assistant": True,
            "custom_branding": True,
            "analytics_dashboard": True,
            "client_reminders_sms": False,
            "client_reminders_whatsapp": False,
            "multi_location": False,
            "white_label": False,
            "client_reminders_voice": False,
            "self_serve": True,
        },
    )
    definition = apply_admin_plan_update(plan, update)
    assert plan.monthly_price == 12000
    assert plan.entitlements["_admin"] is True
    assert definition.has(PlanFeature.ai_assistant)
    assert definition_from_row(plan).has(PlanFeature.ai_assistant)


def test_require_plan_code_rejects_unknown() -> None:
    assert coerce_plan_code("PREMIUM") is PlanCode.premium
    try:
        require_plan_code("gold")
    except ValueError:
        return
    raise AssertionError("expected unknown plan to raise")
