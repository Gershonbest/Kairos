"""Dashboard stats, charts, and upcoming appointments endpoints."""

from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import as_utc, utc_now
from app.core.deps import CurrentUser, get_current_user, require_active_subscription
from app.infra.db import get_db_session
from app.infra.models import Booking, BookingStatus, Client, PaymentStatus, PaymentTransaction, Service

router = APIRouter(dependencies=[Depends(require_active_subscription)])


@router.get("/summary")
async def get_dashboard_summary(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    if not current_user.tenant_id:
        raise HTTPException(status_code=400, detail="No tenant assigned")

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

    completed_transactions = [t for t in transactions if t.status == PaymentStatus.succeeded]
    current_month_revenue = sum(
        float(t.amount)
        for t in completed_transactions
        if t.created_at
        and as_utc(t.created_at).month == current_month
        and as_utc(t.created_at).year == current_year
    )
    previous_month_revenue = sum(
        float(t.amount)
        for t in completed_transactions
        if t.created_at
        and as_utc(t.created_at).month == previous_month
        and as_utc(t.created_at).year == previous_month_year
    )

    avg_booking_value = (
        current_month_revenue / len(current_month_bookings) if current_month_bookings else 0.0
    )

    monthly_revenue_map: dict[str, float] = defaultdict(float)
    for tx in completed_transactions:
        if not tx.created_at:
            continue
        key = as_utc(tx.created_at).strftime("%Y-%m")
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
            "client": client.full_name,
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

    return {
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
