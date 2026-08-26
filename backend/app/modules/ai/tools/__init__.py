"""AI tools: knowledge, catalog, availability, bookings, onboarding."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from langchain_core.tools import tool
from sqlalchemy import select

from app.infra.models import (
    AvailabilityRule,
    Booking,
    BookingStatus,
    Client,
    Service,
    Tenant,
    TenantFaq,
)
from app.modules.ai.context import get_agent_context
from app.modules.ai.knowledge.indexer import reindex_tenant_knowledge
from app.modules.ai.vector.factory import get_vector_store
from app.modules.bookings.service import (
    BookingServiceError,
    cancel_booking,
    create_confirmed_booking,
    get_or_create_client,
    reschedule_booking,
)
from app.modules.payments.service import booking_payment_amount, ensure_booking_payment, initialize_booking_paystack
from app.modules.scheduling.service import generate_slots, load_scheduling_context
from app.modules.tenants.helpers import tenant_display_location


def _require_session_tenant():
    ctx = get_agent_context()
    if ctx.session is None:
        raise RuntimeError("Database session missing from agent context")
    return ctx, ctx.session, ctx.tenant_id


def _queue_hitl(action_type: str, args: dict[str, Any]) -> str | None:
    """For internal audience, queue mutating booking ops for owner approval."""
    ctx = get_agent_context()
    if ctx.audience != "internal":
        return None
    if ctx.extras.get("hitl_auto_approve"):
        return None
    action = {"id": str(uuid4()), "type": action_type, "args": args}
    pending = ctx.extras.setdefault("pending_actions", [])
    pending.append(action)
    return (
        "PENDING_APPROVAL: ask the owner to approve this action in the UI before treating it as done.\n"
        + json.dumps(action)
    )


@tool
async def search_business_knowledge(query: str) -> str:
    """Search this business's profile, services, hours, policies, and FAQs."""
    ctx, _session, tenant_id = _require_session_tenant()
    hits = await get_vector_store().similarity_search(tenant_id=tenant_id, query=query, k=6)
    if not hits:
        return "No matching business knowledge found. Do not invent facts."
    lines = []
    for hit in hits:
        lines.append(f"[{hit.source} | score={hit.score:.3f}]\n{hit.content}")
    return "\n\n---\n\n".join(lines)


@tool
async def list_services() -> str:
    """List active services with duration and pricing."""
    _ctx, session, tenant_id = _require_session_tenant()
    rows = (
        await session.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.active.is_(True))
        )
    ).scalars().all()
    if not rows:
        return "No active services configured."
    return "\n".join(
        (
            f"- {svc.name} ({svc.id}): {svc.duration_minutes} min, "
            f"price {float(svc.price_amount or 0):.0f} NGN, "
            f"deposit {float(svc.deposit_amount or 0):.0f} NGN"
        )
        for svc in rows
    )


@tool
async def get_business_hours() -> str:
    """Return weekly opening hours."""
    _ctx, session, tenant_id = _require_session_tenant()
    rules = (
        await session.execute(select(AvailabilityRule).where(AvailabilityRule.tenant_id == tenant_id))
    ).scalars().all()
    if not rules:
        return "Business hours are not configured yet."
    day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    lines = []
    for rule in sorted(rules, key=lambda row: (row.day_of_week, row.start_time or "")):
        day = day_names[int(rule.day_of_week) % 7]
        if not rule.is_enabled:
            lines.append(f"{day}: closed")
        else:
            lines.append(f"{day}: {rule.start_time}–{rule.end_time}")
    return "\n".join(lines)


@tool
async def get_business_profile() -> str:
    """Return public business profile details for this tenant."""
    _ctx, session, tenant_id = _require_session_tenant()
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    return (
        f"Name: {tenant.name}\n"
        f"Type: {tenant.business_type or 'n/a'}\n"
        f"Tagline: {tenant.public_tagline or 'n/a'}\n"
        f"Description: {tenant.public_description or 'n/a'}\n"
        f"Location: {tenant_display_location(tenant) or tenant.location or 'n/a'}\n"
        f"Cancellation policy: {tenant.cancellation_policy or 'n/a'}\n"
        f"Booking policies: {tenant.booking_policies or 'n/a'}"
    )


@tool
async def check_availability(service_id: str, day: str, assigned_user_id: str = "") -> str:
    """Check open booking slots for a service on a YYYY-MM-DD day. Optionally pass assigned_user_id for a specific staff member."""
    _ctx, session, tenant_id = _require_session_tenant()
    try:
        day_date = datetime.strptime(day, "%Y-%m-%d").date()
    except ValueError:
        return "day must be YYYY-MM-DD"
    service = (
        await session.execute(
            select(Service).where(
                Service.id == service_id,
                Service.tenant_id == tenant_id,
                Service.active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not service:
        return "Service not found"
    from_dt = datetime.combine(day_date, datetime.min.time(), tzinfo=UTC)
    to_dt = from_dt + timedelta(days=1)
    from app.modules.team.staff import union_slots_for_service

    slots = await union_slots_for_service(
        session,
        tenant_id=tenant_id,
        service=service,
        from_dt=from_dt,
        to_dt=to_dt,
        assigned_user_id=assigned_user_id or None,
    )
    if not slots:
        return f"No open slots on {day}."
    return "Open slots:\n" + "\n".join(f"- {slot}" for slot in slots[:20])


async def execute_booking_action(
    session,
    *,
    tenant_id: str,
    action_type: str,
    args: dict[str, Any],
) -> str:
    """Run a queued or direct booking mutation."""
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    if action_type == "create_booking":
        service = (
            await session.execute(
                select(Service).where(
                    Service.id == args["service_id"],
                    Service.tenant_id == tenant_id,
                    Service.active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if not service:
            return "Service not found"
        start = datetime.fromisoformat(str(args["start_at"]).replace("Z", "+00:00"))
        client = await get_or_create_client(
            session,
            tenant_id=tenant_id,
            email=str(args.get("client_email") or ""),
            first_name=str(args.get("client_first_name") or ""),
            last_name=str(args.get("client_last_name") or ""),
            phone=str(args.get("client_phone") or "") or None,
        )
        booking = await create_confirmed_booking(
            session,
            tenant=tenant,
            service=service,
            client=client,
            start_at=start,
            notes=str(args.get("notes") or "") or None,
            guest_first_name=str(args.get("client_first_name") or "") or None,
            guest_last_name=str(args.get("client_last_name") or "") or None,
            assigned_user_id=str(args.get("assigned_user_id") or "") or None,
        )
        payment_note = ""
        amount = booking_payment_amount(service)
        if amount > 0 and tenant.payments_enabled and tenant.payment_account_id:
            tx = await ensure_booking_payment(session, booking, service, booking.idempotency_key, tenant)
            if tx:
                try:
                    tx = await initialize_booking_paystack(
                        session,
                        tenant=tenant,
                        booking=booking,
                        client=client,
                        tx=tx,
                        business_key=tenant.public_slug or tenant.id,
                    )
                    if tx.authorization_url:
                        payment_note = f" Payment link: {tx.authorization_url}"
                except Exception as exc:
                    payment_note = f" Payment init failed: {exc}"
        await session.commit()
        return (
            f"Booking confirmed. id={booking.id}, start={booking.start_at.isoformat()}, "
            f"service={service.name}.{payment_note}"
        )
    if action_type == "cancel_booking":
        booking = await cancel_booking(
            session,
            tenant_id=tenant_id,
            booking_id=str(args["booking_id"]),
            client_email=str(args.get("client_email") or "") or None,
        )
        await session.commit()
        return f"Booking {booking.id} cancelled."
    if action_type == "reschedule_booking":
        start = datetime.fromisoformat(str(args["new_start_at"]).replace("Z", "+00:00"))
        booking = await reschedule_booking(
            session,
            tenant=tenant,
            booking_id=str(args["booking_id"]),
            new_start_at=start,
            client_email=str(args.get("client_email") or "") or None,
        )
        await session.commit()
        return f"Booking {booking.id} rescheduled to {booking.start_at.isoformat()}."
    return f"Unknown action type: {action_type}"


@tool
async def create_booking(
    service_id: str,
    start_at: str,
    client_email: str,
    client_first_name: str = "",
    client_last_name: str = "",
    client_phone: str = "",
    notes: str = "",
    assigned_user_id: str = "",
) -> str:
    """Create a confirmed booking. start_at must be ISO-8601 datetime. assigned_user_id is optional; omit to pick the first free staff member."""
    queued = _queue_hitl(
        "create_booking",
        {
            "service_id": service_id,
            "start_at": start_at,
            "client_email": client_email,
            "client_first_name": client_first_name,
            "client_last_name": client_last_name,
            "client_phone": client_phone,
            "notes": notes,
            "assigned_user_id": assigned_user_id,
        },
    )
    if queued:
        return queued
    _ctx, session, tenant_id = _require_session_tenant()
    try:
        return await execute_booking_action(
            session,
            tenant_id=tenant_id,
            action_type="create_booking",
            args={
                "service_id": service_id,
                "start_at": start_at,
                "client_email": client_email,
                "client_first_name": client_first_name,
                "client_last_name": client_last_name,
                "client_phone": client_phone,
                "notes": notes,
                "assigned_user_id": assigned_user_id,
            },
        )
    except BookingServiceError as exc:
        await session.rollback()
        return f"Could not create booking: {exc}"
    except Exception as exc:
        await session.rollback()
        return f"Could not create booking: {exc}"


@tool
async def cancel_existing_booking(booking_id: str, client_email: str) -> str:
    """Cancel a booking after verifying the client email."""
    queued = _queue_hitl(
        "cancel_booking",
        {"booking_id": booking_id, "client_email": client_email},
    )
    if queued:
        return queued
    _ctx, session, tenant_id = _require_session_tenant()
    try:
        return await execute_booking_action(
            session,
            tenant_id=tenant_id,
            action_type="cancel_booking",
            args={"booking_id": booking_id, "client_email": client_email},
        )
    except BookingServiceError as exc:
        await session.rollback()
        return f"Could not cancel booking: {exc}"


@tool
async def reschedule_existing_booking(booking_id: str, new_start_at: str, client_email: str) -> str:
    """Reschedule a booking to a new ISO-8601 start time."""
    queued = _queue_hitl(
        "reschedule_booking",
        {
            "booking_id": booking_id,
            "new_start_at": new_start_at,
            "client_email": client_email,
        },
    )
    if queued:
        return queued
    _ctx, session, tenant_id = _require_session_tenant()
    try:
        return await execute_booking_action(
            session,
            tenant_id=tenant_id,
            action_type="reschedule_booking",
            args={
                "booking_id": booking_id,
                "new_start_at": new_start_at,
                "client_email": client_email,
            },
        )
    except BookingServiceError as exc:
        await session.rollback()
        return f"Could not reschedule booking: {exc}"


@tool
async def list_upcoming_bookings(limit: int = 8) -> str:
    """List upcoming confirmed/pending bookings for the business owner."""
    ctx, session, tenant_id = _require_session_tenant()
    if ctx.audience != "internal":
        return "Upcoming bookings are only available to business staff."
    now = datetime.now(UTC)
    rows = (
        await session.execute(
            select(Booking, Client, Service)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .where(
                Booking.tenant_id == tenant_id,
                Booking.start_at >= now,
                Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
            )
            .order_by(Booking.start_at.asc())
            .limit(max(1, min(limit, 20)))
        )
    ).all()
    if not rows:
        return "No upcoming bookings."
    return "\n".join(
        (
            f"- {booking.id}: {client.full_name or client.email} / {service.name} "
            f"at {booking.start_at.isoformat()} ({booking.status.value})"
        )
        for booking, client, service in rows
    )


@tool
async def update_business_profile(
    name: str = "",
    business_type: str = "",
    tagline: str = "",
    description: str = "",
    location: str = "",
    cancellation_policy: str = "",
    booking_policies: str = "",
) -> str:
    """Update business profile fields. Pass only fields you want to change."""
    ctx, session, tenant_id = _require_session_tenant()
    if ctx.audience != "internal":
        return "Only business owners can update the profile."
    tenant = (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one()
    if name.strip():
        tenant.name = name.strip()[:160]
    if business_type.strip():
        tenant.business_type = business_type.strip()[:80]
    if tagline.strip():
        tenant.public_tagline = tagline.strip()[:220]
    if description.strip():
        tenant.public_description = description.strip()
    if location.strip():
        tenant.location = location.strip()[:120]
    if cancellation_policy.strip():
        tenant.cancellation_policy = cancellation_policy.strip()
    if booking_policies.strip():
        tenant.booking_policies = booking_policies.strip()
    await session.flush()
    await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    return "Business profile updated and knowledge reindexed."


@tool
async def upsert_service(
    name: str,
    duration_minutes: int = 60,
    price_amount: float = 0,
    deposit_amount: float = 0,
    service_id: str = "",
    client_instructions: str = "",
) -> str:
    """Create or update a service. Provide service_id to update an existing one."""
    ctx, session, tenant_id = _require_session_tenant()
    if ctx.audience != "internal":
        return "Only business owners can manage services."
    service: Service | None = None
    if service_id.strip():
        service = (
            await session.execute(
                select(Service).where(Service.id == service_id, Service.tenant_id == tenant_id)
            )
        ).scalar_one_or_none()
        if not service:
            return "Service not found"
    else:
        service = Service(tenant_id=tenant_id, name=name.strip()[:160] or "Service", active=True)
        session.add(service)
    service.name = name.strip()[:160] or service.name
    service.duration_minutes = max(5, int(duration_minutes or 60))
    service.price_amount = max(0, float(price_amount or 0))
    service.deposit_amount = max(0, float(deposit_amount or 0))
    if client_instructions.strip():
        service.client_instructions = client_instructions.strip()
    await session.flush()
    await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    return f"Service saved. id={service.id}, name={service.name}"


@tool
async def set_weekly_hours(day_of_week: int, start_time: str, end_time: str, is_enabled: bool = True) -> str:
    """Set hours for one weekday (0=Sunday … 6=Saturday in Orheo). Times as HH:MM."""
    ctx, session, tenant_id = _require_session_tenant()
    if ctx.audience != "internal":
        return "Only business owners can update hours."
    if day_of_week < 0 or day_of_week > 6:
        return "day_of_week must be 0-6"
    existing = (
        await session.execute(
            select(AvailabilityRule).where(
                AvailabilityRule.tenant_id == tenant_id,
                AvailabilityRule.day_of_week == day_of_week,
            )
        )
    ).scalar_one_or_none()
    if not existing:
        existing = AvailabilityRule(
            tenant_id=tenant_id,
            day_of_week=day_of_week,
            start_time=start_time or "09:00",
            end_time=end_time or "17:00",
        )
        session.add(existing)
    existing.is_enabled = bool(is_enabled)
    existing.start_time = start_time or existing.start_time or "09:00"
    existing.end_time = end_time or existing.end_time or "17:00"
    await session.flush()
    await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    return f"Hours updated for day {day_of_week}."


@tool
async def upsert_faq(question: str, answer: str, faq_id: str = "") -> str:
    """Create or update a FAQ entry used by the public assistant."""
    ctx, session, tenant_id = _require_session_tenant()
    if ctx.audience != "internal":
        return "Only business owners can manage FAQs."
    faq: TenantFaq | None = None
    if faq_id.strip():
        faq = (
            await session.execute(
                select(TenantFaq).where(TenantFaq.id == faq_id, TenantFaq.tenant_id == tenant_id)
            )
        ).scalar_one_or_none()
    if not faq:
        faq = TenantFaq(tenant_id=tenant_id, question=question.strip(), answer=answer.strip())
        session.add(faq)
    else:
        faq.question = question.strip()[:500]
        faq.answer = answer.strip()
    await session.flush()
    await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    return f"FAQ saved. id={faq.id}"


@tool
async def reindex_knowledge() -> str:
    """Rebuild the tenant knowledge index from current profile/services/FAQs."""
    ctx, session, tenant_id = _require_session_tenant()
    if ctx.audience != "internal":
        return "Only business owners can reindex knowledge."
    count = await reindex_tenant_knowledge(session, tenant_id)
    await session.commit()
    return f"Reindexed {count} knowledge chunks."


PUBLIC_TOOLS = [
    search_business_knowledge,
    list_services,
    get_business_hours,
    get_business_profile,
    check_availability,
    create_booking,
    cancel_existing_booking,
    reschedule_existing_booking,
]

ONBOARDING_TOOLS = [
    search_business_knowledge,
    get_business_profile,
    list_services,
    get_business_hours,
    update_business_profile,
    upsert_service,
    set_weekly_hours,
    upsert_faq,
    reindex_knowledge,
]

BUSINESS_TOOLS = [
    *ONBOARDING_TOOLS,
    check_availability,
    create_booking,
    cancel_existing_booking,
    reschedule_existing_booking,
    list_upcoming_bookings,
]
