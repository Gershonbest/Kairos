"""Balance payment recording after service delivery."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.infra.models import (
    Base,
    Booking,
    BookingStatus,
    Client,
    PaymentStatus,
    PaymentTransaction,
    Service,
    Tenant,
)
from app.modules.payments.service import (
    BookingPaymentError,
    booking_payment_summary,
    collected_for_booking,
    ensure_booking_payment,
    record_balance_payment,
    waive_booking_balance,
)


async def _session() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return factory()


async def _fixture(session: AsyncSession) -> tuple[Tenant, Service, Booking, Client]:
    tenant = Tenant(name="Salon", timezone="Africa/Lagos")
    session.add(tenant)
    await session.flush()
    service = Service(
        tenant_id=tenant.id,
        name="Haircut",
        duration_minutes=60,
        price_amount=15000,
        deposit_amount=5000,
        active=True,
    )
    client = Client(tenant_id=tenant.id, email="a@example.com", full_name="Ada Lovelace")
    session.add_all([service, client])
    await session.flush()
    start = datetime.now(UTC) + timedelta(days=1)
    booking = Booking(
        tenant_id=tenant.id,
        client_id=client.id,
        service_id=service.id,
        start_at=start,
        end_at=start + timedelta(hours=1),
        status=BookingStatus.confirmed,
        idempotency_key="bal-test-1",
    )
    session.add(booking)
    await session.flush()
    await ensure_booking_payment(session, booking, service, booking.idempotency_key, tenant)
    deposit_tx = (
        await session.execute(
            select(PaymentTransaction).where(PaymentTransaction.booking_id == booking.id)
        )
    ).scalar_one()
    deposit_tx.status = PaymentStatus.succeeded
    deposit_tx.paid_at = datetime.now(UTC)
    await session.flush()
    return tenant, service, booking, client


@pytest.mark.asyncio
async def test_record_balance_payment_after_deposit() -> None:
    session = await _session()
    async with session:
        tenant, service, booking, client = await _fixture(session)
        summary_before = await booking_payment_summary(session, booking=booking, service=service)
        assert summary_before["payment_state"] == "deposit_paid"
        assert summary_before["balance_due"] == 10000

        await record_balance_payment(
            session,
            tenant_id=tenant.id,
            booking=booking,
            service=service,
            amount=10000,
            method="cash",
        )
        await session.commit()

        collected = await collected_for_booking(session, booking.id)
        assert collected == 15000
        summary_after = await booking_payment_summary(session, booking=booking, service=service)
        assert summary_after["payment_state"] == "fully_paid"
        assert summary_after["balance_due"] == 0


@pytest.mark.asyncio
async def test_no_show_forfeits_balance() -> None:
    session = await _session()
    async with session:
        tenant, service, booking, client = await _fixture(session)
        booking.status = BookingStatus.no_show
        await session.flush()
        summary = await booking_payment_summary(session, booking=booking, service=service)
        assert summary["payment_state"] == "forfeited"
        assert summary["balance_due"] == 0
        assert summary["collected_total"] == 5000


@pytest.mark.asyncio
async def test_waive_balance() -> None:
    session = await _session()
    async with session:
        tenant, service, booking, client = await _fixture(session)
        await waive_booking_balance(session, tenant_id=tenant.id, booking=booking, service=service)
        summary = await booking_payment_summary(session, booking=booking, service=service)
        assert summary["payment_state"] == "waived"
        assert summary["balance_due"] == 0


@pytest.mark.asyncio
async def test_record_balance_rejects_overpayment() -> None:
    session = await _session()
    async with session:
        tenant, service, booking, client = await _fixture(session)
        with pytest.raises(BookingPaymentError):
            await record_balance_payment(
                session,
                tenant_id=tenant.id,
                booking=booking,
                service=service,
                amount=20000,
                method="cash",
            )
