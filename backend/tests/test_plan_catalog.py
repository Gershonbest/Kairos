"""Plan catalog enums are the source of truth for features and entitlements."""

from app.core.plans import (
    PLAN_CATALOG,
    PlanCode,
    PlanFeature,
    coerce_plan_code,
    plan_definition,
    plan_has_feature,
    require_plan_code,
)
from app.modules.subscriptions.service import serialize_plan


def test_plan_codes_are_fixed_enums() -> None:
    assert {code.value for code in PlanCode} == {"standard", "premium", "enterprise"}
    assert set(PLAN_CATALOG) == set(PlanCode)


def test_standard_does_not_include_ai_or_sms_reminders() -> None:
    standard = plan_definition(PlanCode.standard)
    assert PlanFeature.payment_processing in standard.features
    assert PlanFeature.client_reminders_email in standard.features
    assert not plan_has_feature(PlanCode.standard, PlanFeature.ai_assistant)
    assert not plan_has_feature(PlanCode.standard, PlanFeature.client_reminders_sms)


def test_premium_and_enterprise_feature_sets() -> None:
    assert plan_has_feature("premium", PlanFeature.ai_assistant)
    assert plan_has_feature("premium", PlanFeature.client_reminders_whatsapp)
    assert not plan_has_feature("premium", PlanFeature.white_label)
    assert plan_has_feature(PlanCode.enterprise, PlanFeature.white_label)
    assert plan_has_feature(PlanCode.enterprise, PlanFeature.client_reminders_voice)


def test_serialize_plan_returns_enum_feature_codes() -> None:
    plan = type("Plan", (), {"id": "1", "code": PlanCode.premium})()
    payload = serialize_plan(plan, include_admin_fields=True)
    assert payload["code"] == "premium"
    assert "ai_assistant" in payload["feature_codes"]
    assert payload["entitlements"]["ai_assistant"] is True
    assert "AI booking assistant" in payload["features"]


def test_require_plan_code_rejects_unknown() -> None:
    assert coerce_plan_code("PREMIUM") is PlanCode.premium
    try:
        require_plan_code("gold")
    except ValueError:
        return
    raise AssertionError("expected unknown plan to raise")
