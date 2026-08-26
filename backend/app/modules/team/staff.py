"""Staff assignment, hours, and Anyone-slot helpers."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infra.models import (
    AvailabilityRule,
    Booking,
    BookingStatus,
    CalendarBlock,
    Service,
    StaffAvailabilityRule,
    StaffRole,
    User,
    UserRole,
    service_staff,
)
from app.modules.scheduling.service import booking_blocks_slot, generate_slots


def is_bookable_user(user: User) -> bool:
    if not user.is_active:
        return False
    if user.role == UserRole.tenant_admin:
        return bool(user.is_bookable)
    if user.staff_role == StaffRole.staff:
        return True
    return bool(user.is_bookable)


def assignee_snapshot(user: User) -> tuple[str, str | None]:
    title = (user.job_title or "").strip() or None
    if user.role == UserRole.tenant_admin and not title:
        title = "Owner"
    return user.full_name, title


def staff_sort_key(user: User) -> tuple[str, str]:
    return ((user.job_title or "").strip().lower(), user.full_name.strip().lower())


def booking_host_name(booking: Booking, service: Service) -> str | None:
    return getattr(booking, "assigned_name", None) or getattr(service, "host_name", None)


def booking_host_title(booking: Booking, service: Service) -> str | None:
    return getattr(booking, "assigned_title", None) or getattr(service, "host_title", None)


def serialize_staff_member(user: User) -> dict:
    name, title = assignee_snapshot(user)
    return {
        "id": user.id,
        "full_name": name,
        "email": user.email,
        "job_title": title,
        "staff_role": user.staff_role.value if user.staff_role else None,
        "is_owner": user.role == UserRole.tenant_admin,
        "is_bookable": is_bookable_user(user),
        "is_active": user.is_active,
    }


def assignment_blocks_slot(
    booking: Booking,
    *,
    user_id: str,
    listing_id: str | None,
    start_at: datetime,
    end_at: datetime,
    buffer_minutes: int,
) -> bool:
    staff_hit = booking.assigned_user_id == user_id
    listing_hit = bool(listing_id and getattr(booking, "listing_id", None) == listing_id)
    return (staff_hit or listing_hit) and booking_blocks_slot(booking, start_at, end_at, buffer_minutes)


async def load_service_with_staff(session: AsyncSession, service_id: str, tenant_id: str) -> Service | None:
    return (
        await session.execute(
            select(Service)
            .options(selectinload(Service.staff))
            .where(Service.id == service_id, Service.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


async def bookable_staff_for_service(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
) -> list[User]:
    staff = list(
        (
            await session.execute(
                select(User)
                .join(service_staff, service_staff.c.user_id == User.id)
                .where(service_staff.c.service_id == service.id, User.tenant_id == tenant_id)
            )
        )
        .scalars()
        .all()
    )
    if not staff:
        owner = (
            await session.execute(
                select(User)
                .where(
                    User.tenant_id == tenant_id,
                    User.role == UserRole.tenant_admin,
                    User.is_active.is_(True),
                )
                .order_by(User.created_at.asc())
            )
        ).scalars().first()
        staff = [owner] if owner else []
    bookable = [user for user in staff if is_bookable_user(user)]
    return sorted(bookable, key=staff_sort_key)


async def resolve_assignable_user(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
    assigned_user_id: str | None,
) -> User:
    bookable = await bookable_staff_for_service(session, tenant_id=tenant_id, service=service)
    if not bookable:
        raise ValueError("No bookable team member is assigned to this service")
    if assigned_user_id:
        match = next((user for user in bookable if user.id == assigned_user_id), None)
        if not match:
            raise ValueError("That team member cannot deliver this service")
        return match
    return bookable[0]


async def load_hours_for_user(
    session: AsyncSession,
    *,
    tenant_id: str,
    user_id: str,
) -> list[AvailabilityRule] | list[StaffAvailabilityRule]:
    staff_rules = list(
        (
            await session.execute(
                select(StaffAvailabilityRule).where(
                    StaffAvailabilityRule.tenant_id == tenant_id,
                    StaffAvailabilityRule.user_id == user_id,
                )
            )
        )
        .scalars()
        .all()
    )
    if staff_rules:
        return staff_rules
    return list(
        (
            await session.execute(
                select(AvailabilityRule).where(AvailabilityRule.tenant_id == tenant_id)
            )
        )
        .scalars()
        .all()
    )


async def overlapping_staff_bookings(
    session: AsyncSession,
    *,
    tenant_id: str,
    user_id: str,
    start_at: datetime,
    end_at: datetime,
    buffer_minutes: int,
    ignore_booking_id: str | None = None,
    listing_id: str | None = None,
) -> list[Booking]:
    conditions = [Booking.assigned_user_id == user_id]
    if listing_id:
        conditions.append(Booking.listing_id == listing_id)
    nearby = list(
        (
            await session.execute(
                select(Booking).where(
                    Booking.tenant_id == tenant_id,
                    Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
                    Booking.start_at < end_at + timedelta(minutes=buffer_minutes),
                    Booking.end_at > start_at - timedelta(minutes=buffer_minutes),
                    or_(*conditions),
                )
            )
        )
        .scalars()
        .all()
    )
    conflicts: list[Booking] = []
    for row in nearby:
        if ignore_booking_id and row.id == ignore_booking_id:
            continue
        if assignment_blocks_slot(
            row,
            user_id=user_id,
            listing_id=listing_id,
            start_at=start_at,
            end_at=end_at,
            buffer_minutes=buffer_minutes,
        ):
            conflicts.append(row)
    return conflicts


async def load_staff_conflict_bookings(
    session: AsyncSession,
    *,
    tenant_id: str,
    user_id: str,
    from_dt: datetime,
    to_dt: datetime,
    listing_id: str | None = None,
) -> list[Booking]:
    filters = [
        Booking.tenant_id == tenant_id,
        Booking.status.in_([BookingStatus.pending, BookingStatus.confirmed]),
        Booking.start_at >= from_dt - timedelta(days=1),
        Booking.start_at <= to_dt + timedelta(days=1),
    ]
    if listing_id:
        rows = list(
            (
                await session.execute(
                    select(Booking).where(
                        *filters,
                        or_(Booking.assigned_user_id == user_id, Booking.listing_id == listing_id),
                    )
                )
            )
            .scalars()
            .all()
        )
    else:
        rows = list(
            (
                await session.execute(
                    select(Booking).where(*filters, Booking.assigned_user_id == user_id)
                )
            )
            .scalars()
            .all()
        )
    return rows


async def slots_for_staff(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
    user: User,
    from_dt: datetime,
    to_dt: datetime,
    listing_id: str | None = None,
    calendar_blocks: list[CalendarBlock] | None = None,
) -> list[str]:
    rules = await load_hours_for_user(session, tenant_id=tenant_id, user_id=user.id)
    existing = await load_staff_conflict_bookings(
        session,
        tenant_id=tenant_id,
        user_id=user.id,
        from_dt=from_dt,
        to_dt=to_dt,
        listing_id=listing_id,
    )
    if calendar_blocks is None:
        calendar_blocks = list(
            (
                await session.execute(
                    select(CalendarBlock).where(
                        CalendarBlock.tenant_id == tenant_id,
                        CalendarBlock.end_date >= from_dt.date(),
                        CalendarBlock.start_date <= to_dt.date(),
                    )
                )
            )
            .scalars()
            .all()
        )
    return generate_slots(
        from_dt=from_dt,
        to_dt=to_dt,
        service=service,
        rules=rules,  # type: ignore[arg-type]
        existing_bookings=existing,
        calendar_blocks=calendar_blocks,
    )


async def union_slots_for_service(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
    from_dt: datetime,
    to_dt: datetime,
    listing_id: str | None = None,
    assigned_user_id: str | None = None,
) -> list[str]:
    staff = await bookable_staff_for_service(session, tenant_id=tenant_id, service=service)
    if assigned_user_id:
        staff = [user for user in staff if user.id == assigned_user_id]
    if not staff:
        return []
    calendar_blocks = list(
        (
            await session.execute(
                select(CalendarBlock).where(
                    CalendarBlock.tenant_id == tenant_id,
                    CalendarBlock.end_date >= from_dt.date(),
                    CalendarBlock.start_date <= to_dt.date(),
                )
            )
        )
        .scalars()
        .all()
    )
    seen: set[str] = set()
    slots: list[str] = []
    for user in staff:
        for slot in await slots_for_staff(
            session,
            tenant_id=tenant_id,
            service=service,
            user=user,
            from_dt=from_dt,
            to_dt=to_dt,
            listing_id=listing_id,
            calendar_blocks=calendar_blocks,
        ):
            if slot not in seen:
                seen.add(slot)
                slots.append(slot)
    slots.sort()
    return slots


async def first_available_staff(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
    start_at: datetime,
    end_at: datetime,
    listing_id: str | None = None,
) -> User | None:
    staff = await bookable_staff_for_service(session, tenant_id=tenant_id, service=service)
    buffer_minutes = service.buffer_minutes or 0
    day_start = start_at.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1) - timedelta(microseconds=1)
    calendar_blocks = list(
        (
            await session.execute(
                select(CalendarBlock).where(
                    CalendarBlock.tenant_id == tenant_id,
                    CalendarBlock.start_date <= start_at.date(),
                    CalendarBlock.end_date >= start_at.date(),
                )
            )
        )
        .scalars()
        .all()
    )
    for user in staff:
        slots = await slots_for_staff(
            session,
            tenant_id=tenant_id,
            service=service,
            user=user,
            from_dt=day_start,
            to_dt=day_end,
            listing_id=listing_id,
            calendar_blocks=calendar_blocks,
        )
        wanted = start_at.isoformat()
        if wanted in slots or any(
            datetime.fromisoformat(slot.replace("Z", "+00:00")) == start_at for slot in slots
        ):
            conflicts = await overlapping_staff_bookings(
                session,
                tenant_id=tenant_id,
                user_id=user.id,
                start_at=start_at,
                end_at=end_at,
                buffer_minutes=buffer_minutes,
                listing_id=listing_id,
            )
            if not conflicts:
                return user
    return None


async def assert_staff_slot_available(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
    user: User,
    start_at: datetime,
    end_at: datetime,
    listing_id: str | None = None,
    ignore_booking_id: str | None = None,
) -> None:
    conflicts = await overlapping_staff_bookings(
        session,
        tenant_id=tenant_id,
        user_id=user.id,
        start_at=start_at,
        end_at=end_at,
        buffer_minutes=service.buffer_minutes or 0,
        ignore_booking_id=ignore_booking_id,
        listing_id=listing_id,
    )
    if conflicts:
        raise ValueError("Slot already booked")


async def set_service_staff(
    session: AsyncSession,
    *,
    tenant_id: str,
    service: Service,
    user_ids: list[str],
) -> None:
    unique_ids = list(dict.fromkeys(user_ids))
    if not unique_ids:
        raise ValueError("Select at least one team member for this service")
    users = list(
        (
            await session.execute(
                select(User).where(
                    User.tenant_id == tenant_id,
                    User.id.in_(unique_ids),
                    User.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    if len(users) != len(unique_ids):
        raise ValueError("One or more selected team members were not found")
    for user in users:
        if not is_bookable_user(user) and user.role != UserRole.tenant_admin:
            raise ValueError(f"{user.full_name} is not bookable")
    # Replace assignments via the junction table directly so we never trigger
    # implicit lazy-loads on service.staff in async contexts.
    await session.execute(delete(service_staff).where(service_staff.c.service_id == service.id))
    await session.execute(
        insert(service_staff),
        [{"service_id": service.id, "user_id": user_id} for user_id in unique_ids],
    )
    await session.flush()
