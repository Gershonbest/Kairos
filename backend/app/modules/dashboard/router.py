"""Dashboard stats, charts, and upcoming appointments endpoints."""

from collections import defaultdict
from datetime import UTC, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import as_utc, utc_now
from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.cache import redis_cache
from app.infra.db import get_db_session
from app.infra.models import (
    Booking,
    BookingStatus,
    Client,
    PaymentStatus,
    PaymentTransaction,
    Service,
    Tenant,
)
from app.modules.clients.names import visit_display_name

router = APIRouter(dependencies=[Depends(require_active_subscription)])

DASHBOARD_CACHE = "dashboard:summary"


def _tenant_time_window(now_utc, timezone_name: str) -> dict[str, object]:
    zone = ZoneInfo(timezone_name or "Africa/Lagos")
    local_now = now_utc.astimezone(zone)
    local_day_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    local_day_end = local_day_start + timedelta(days=1)
    local_week_start = local_day_start - timedelta(days=local_day_start.weekday())
    local_month_start = local_day_start.replace(day=1)
    return {
        "now_utc": now_utc,
        "day_start_utc": local_day_start.astimezone(UTC),
        "day_end_utc": local_day_end.astimezone(UTC),
        "week_start_utc": local_week_start.astimezone(UTC),
        "month_start_utc": local_month_start.astimezone(UTC),
    }


@router.get("/home/stats")
async def get_dashboard_home_stats(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    now = utc_now()
    window = _tenant_time_window(now, tenant.timezone or "Africa/Lagos")
    day_start_utc = window["day_start_utc"]
    day_end_utc = window["day_end_utc"]
    week_start_utc = window["week_start_utc"]
    month_start_utc = window["month_start_utc"]

    todays_bookings = (
        await session.execute(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.tenant_id == tenant.id,
                Booking.start_at >= day_start_utc,
                Booking.start_at < day_end_utc,
                Booking.status != BookingStatus.cancelled,
            )
        )
    ).scalar_one()

    pending_confirmations = (
        await session.execute(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.tenant_id == tenant.id,
                Booking.start_at >= day_start_utc,
                Booking.start_at < day_end_utc,
                Booking.status == BookingStatus.pending,
            )
        )
    ).scalar_one()

    weekly_revenue = (
        await session.execute(
            select(func.coalesce(func.sum(PaymentTransaction.amount), 0))
            .where(
                PaymentTransaction.tenant_id == tenant.id,
                PaymentTransaction.status == PaymentStatus.succeeded,
                PaymentTransaction.purpose == "booking",
                func.coalesce(PaymentTransaction.paid_at, PaymentTransaction.created_at) >= week_start_utc,
                func.coalesce(PaymentTransaction.paid_at, PaymentTransaction.created_at) <= now,
            )
        )
    ).scalar_one()

    monthly_revenue = (
        await session.execute(
            select(func.coalesce(func.sum(PaymentTransaction.amount), 0))
            .where(
                PaymentTransaction.tenant_id == tenant.id,
                PaymentTransaction.status == PaymentStatus.succeeded,
                PaymentTransaction.purpose == "booking",
                func.coalesce(PaymentTransaction.paid_at, PaymentTransaction.created_at) >= month_start_utc,
                func.coalesce(PaymentTransaction.paid_at, PaymentTransaction.created_at) <= now,
            )
        )
    ).scalar_one()

    first_booking_subquery = (
        select(
            Booking.client_id.label("client_id"),
            func.min(Booking.start_at).label("first_booking_at"),
        )
        .where(
            Booking.tenant_id == tenant.id,
            Booking.status != BookingStatus.cancelled,
        )
        .group_by(Booking.client_id)
        .subquery()
    )
    new_clients = (
        await session.execute(
            select(func.count())
            .select_from(first_booking_subquery)
            .where(
                first_booking_subquery.c.first_booking_at >= week_start_utc,
                first_booking_subquery.c.first_booking_at <= now,
            )
        )
    ).scalar_one()

    currency = (
        await session.execute(
            select(PaymentTransaction.currency)
            .where(
                PaymentTransaction.tenant_id == tenant.id,
                PaymentTransaction.purpose == "booking",
            )
            .order_by(PaymentTransaction.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none() or "NGN"

    return {
        "todays_bookings": int(todays_bookings or 0),
        "revenue_month": round(float(monthly_revenue or 0), 2),
        "revenue_week": round(float(weekly_revenue or 0), 2),
        "pending_confirmations": int(pending_confirmations or 0),
        "new_clients": int(new_clients or 0),
        "new_clients_period": "week",
        "currency": currency,
    }


@router.get("/summary")
async def get_dashboard_summary(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

    cache_key = redis_cache.tenant_key(current_user.tenant_id, DASHBOARD_CACHE)
    cached = await redis_cache.get_json(cache_key)
    if isinstance(cached, dict):
        return cached

    bookings = (
        await session.execute(select(Booking).where(Booking.tenant_id == current_user.tenant_id))
    ).scalars().all()
    clients = (
        await session.execute(select(Client).where(Client.tenant_id == current_user.tenant_id))
    ).scalars().all()
    transactions = (
        await session.execute(
            select(PaymentTransaction).where(PaymentTransaction.tenant_id == current_user.tenant_id)
        )
    ).scalars().all()

    now = utc_now()
    current_month = now.month
    current_year = now.year
    previous_month = 12 if current_month == 1 else current_month - 1
    previous_month_year = current_year - 1 if current_month == 1 else current_year

    current_month_bookings = [
        b
        for b in bookings
        if as_utc(b.start_at).month == current_month and as_utc(b.start_at).year == current_year
    ]
    previous_month_bookings = [
        b
        for b in bookings
        if as_utc(b.start_at).month == previous_month and as_utc(b.start_at).year == previous_month_year
    ]

    # Business dashboard revenue is client booking payments only — never include
    # subscription fees the tenant paid to Orheo.
    completed_transactions = [
        t
        for t in transactions
        if t.status == PaymentStatus.succeeded and t.purpose == "booking"
    ]

    def transaction_month(tx: PaymentTransaction) -> tuple[int, int] | None:
        when = tx.paid_at or tx.created_at
        if not when:
            return None
        stamp = as_utc(when)
        return stamp.year, stamp.month

    current_month_revenue = sum(
        float(t.amount)
        for t in completed_transactions
        if transaction_month(t) == (current_year, current_month)
    )
    previous_month_revenue = sum(
        float(t.amount)
        for t in completed_transactions
        if transaction_month(t) == (previous_month_year, previous_month)
    )

    avg_booking_value = (
        current_month_revenue / len(current_month_bookings) if current_month_bookings else 0.0
    )

    monthly_revenue_map: dict[str, float] = defaultdict(float)
    for tx in completed_transactions:
        when = tx.paid_at or tx.created_at
        if not when:
            continue
        key = as_utc(when).strftime("%Y-%m")
        monthly_revenue_map[key] += float(tx.amount)

    revenue_series: list[dict] = []
    for i in range(5, -1, -1):
        month_ref = now.replace(day=1) - timedelta(days=i * 31)
        month_key = month_ref.strftime("%Y-%m")
        revenue_series.append(
            {"month": month_ref.strftime("%b"), "revenue": round(monthly_revenue_map.get(month_key, 0.0), 2)}
        )

    weekly_booking_map: dict[str, int] = defaultdict(int)
    week_start = now - timedelta(days=6)
    for booking in bookings:
        start_at = as_utc(booking.start_at)
        if start_at >= week_start:
            weekly_booking_map[start_at.strftime("%a")] += 1
    bookings_series = [
        {"day": day, "bookings": weekly_booking_map.get(day, 0)}
        for day in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    ]

    upcoming_rows = (
        await session.execute(
            select(Booking, Client, Service)
            .join(Client, Booking.client_id == Client.id)
            .join(Service, Booking.service_id == Service.id)
            .where(
                Booking.tenant_id == current_user.tenant_id,
                Booking.start_at >= now,
                Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
            )
            .order_by(Booking.start_at.asc())
            .limit(6)
        )
    ).all()
    upcoming = [
        {
            "id": booking.id,
            "client": visit_display_name(booking, client),
            "service": service.name,
            "status": booking.status.value,
            "start_at": as_utc(booking.start_at).isoformat(),
            "time": as_utc(booking.start_at).strftime("%I:%M %p"),
            "date": as_utc(booking.start_at).strftime("%a, %b %d"),
        }
        for booking, client, service in upcoming_rows
    ]

    def pct_change(current: float, previous: float) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return ((current - previous) / previous) * 100.0

    payload = {
        "stats": {
            "total_bookings": len(bookings),
            "monthly_revenue": round(current_month_revenue, 2),
            "active_clients": len(clients),
            "avg_booking_value": round(avg_booking_value, 2),
            "bookings_change_pct": round(
                pct_change(len(current_month_bookings), len(previous_month_bookings)), 1
            ),
            "revenue_change_pct": round(pct_change(current_month_revenue, previous_month_revenue), 1),
        },
        "revenue_series": revenue_series,
        "bookings_series": bookings_series,
        "upcoming_appointments": upcoming,
    }
    await redis_cache.set_json(cache_key, payload)
    return payload
