"""Team seats, permissions, and staff assignment helpers."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.core.permissions import (
    CALENDAR_ALL,
    PAYMENTS_MANAGE,
    TEAM_MANAGE,
    permissions_for,
)
from app.core.plans import plan_definition
from app.infra.models import StaffRole, UserRole
from app.modules.notifications.service import create_booking_notifications
from app.modules.scheduling.service import booking_blocks_slot, generate_slots
from app.modules.team.service import SEAT_UPGRADE_DETAIL, TeamServiceError
from app.modules.team.staff import assignment_blocks_slot, is_bookable_user, serialize_staff_member, staff_sort_key


def test_owner_has_team_and_billing_permissions() -> None:
    perms = permissions_for(role=UserRole.tenant_admin, staff_role=None)
    assert TEAM_MANAGE in perms
    assert PAYMENTS_MANAGE in perms
    assert CALENDAR_ALL in perms


def test_staff_cannot_see_other_calendars_or_billing() -> None:
    perms = permissions_for(role=UserRole.tenant_user, staff_role=StaffRole.staff)
    assert CALENDAR_ALL not in perms
    assert PAYMENTS_MANAGE not in perms
    assert TEAM_MANAGE not in perms


def test_manager_can_operate_but_not_bill() -> None:
    perms = permissions_for(role=UserRole.tenant_user, staff_role=StaffRole.manager)
    assert CALENDAR_ALL in perms
    assert PAYMENTS_MANAGE not in perms
    assert TEAM_MANAGE not in perms


def test_front_desk_cannot_edit_services() -> None:
    perms = permissions_for(role=UserRole.tenant_user, staff_role=StaffRole.front_desk)
    assert CALENDAR_ALL in perms
    from app.core.permissions import SERVICES_WRITE

    assert SERVICES_WRITE not in perms


def test_standard_plan_cannot_invite() -> None:
    standard = plan_definition("standard")
    assert standard.team_members == 1
    err = TeamServiceError(SEAT_UPGRADE_DETAIL, status_code=402)
    assert err.status_code == 402
    assert "Premium" in str(err)


def test_premium_and_enterprise_seat_limits() -> None:
    assert plan_definition("premium").team_members == 5
    assert plan_definition("enterprise").team_members is None


def test_owner_and_staff_role_are_bookable() -> None:
    owner = SimpleNamespace(
        is_active=True, role=UserRole.tenant_admin, staff_role=None, is_bookable=True
    )
    staff = SimpleNamespace(
        is_active=True, role=UserRole.tenant_user, staff_role=StaffRole.staff, is_bookable=False
    )
    desk = SimpleNamespace(
        is_active=True, role=UserRole.tenant_user, staff_role=StaffRole.front_desk, is_bookable=False
    )
    assert is_bookable_user(owner)
    assert is_bookable_user(staff)
    assert not is_bookable_user(desk)


def test_two_staff_can_share_the_same_hour() -> None:
    start = datetime(2026, 8, 26, 10, 0, tzinfo=UTC)
    end = start + timedelta(hours=1)
    other_staff_booking = SimpleNamespace(
        assigned_user_id="staff-b",
        listing_id=None,
        start_at=start,
        end_at=end,
    )
    assert not assignment_blocks_slot(
        other_staff_booking,
        user_id="staff-a",
        listing_id=None,
        start_at=start,
        end_at=end,
        buffer_minutes=0,
    )


def test_same_staff_overlap_is_detected() -> None:
    start = datetime(2026, 8, 26, 10, 0, tzinfo=UTC)
    end = start + timedelta(hours=1)
    existing = SimpleNamespace(
        assigned_user_id="staff-a",
        listing_id=None,
        start_at=start,
        end_at=end,
    )
    assert assignment_blocks_slot(
        existing,
        user_id="staff-a",
        listing_id=None,
        start_at=start,
        end_at=end,
        buffer_minutes=0,
    )
    later = SimpleNamespace(
        assigned_user_id="staff-a",
        listing_id=None,
        start_at=end,
        end_at=end + timedelta(hours=1),
    )
    assert not assignment_blocks_slot(
        later,
        user_id="staff-a",
        listing_id=None,
        start_at=start,
        end_at=end,
        buffer_minutes=0,
    )
    assert booking_blocks_slot(existing, start, end, 0)
    assert not booking_blocks_slot(later, start, end, 0)


def test_generate_slots_ignores_other_staff_bookings() -> None:
    from app.infra.models import BookingStatus, SchedulingMode

    service = SimpleNamespace(
        duration_minutes=60,
        buffer_minutes=0,
        scheduling_mode=SchedulingMode.fixed,
    )
    rules = [
        SimpleNamespace(day_of_week=3, start_time="09:00", end_time="12:00", is_enabled=True),
    ]
    day = datetime(2026, 8, 26, 0, 0, tzinfo=UTC)  # Wednesday
    end = datetime(2026, 8, 26, 23, 59, tzinfo=UTC)
    other = SimpleNamespace(
        status=BookingStatus.confirmed,
        start_at=datetime(2026, 8, 26, 9, 0, tzinfo=UTC),
        end_at=datetime(2026, 8, 26, 10, 0, tzinfo=UTC),
    )
    slots = generate_slots(
        from_dt=day,
        to_dt=end,
        service=service,
        rules=rules,
        existing_bookings=[],
        calendar_blocks=[],
    )
    with_other = generate_slots(
        from_dt=day,
        to_dt=end,
        service=service,
        rules=rules,
        existing_bookings=[other],
        calendar_blocks=[],
    )
    assert slots
    assert len(with_other) == len(slots) - 1


def test_staff_sort_is_title_then_name() -> None:
    ada = SimpleNamespace(job_title="Stylist", full_name="Ada")
    bo = SimpleNamespace(job_title="Stylist", full_name="Bo")
    zed = SimpleNamespace(job_title="Owner", full_name="Zed")
    ordered = sorted([zed, bo, ada], key=staff_sort_key)
    assert [row.full_name for row in ordered] == ["Zed", "Ada", "Bo"]


def test_notifications_go_to_assignee_and_owner() -> None:
    import asyncio

    owner = SimpleNamespace(
        id="owner",
        role=UserRole.tenant_admin,
        staff_role=None,
        is_active=True,
    )
    assignee = SimpleNamespace(
        id="staff-1",
        role=UserRole.tenant_user,
        staff_role=StaffRole.staff,
        is_active=True,
    )
    other = SimpleNamespace(
        id="staff-2",
        role=UserRole.tenant_user,
        staff_role=StaffRole.staff,
        is_active=True,
    )
    added: list[str] = []

    class FakeSession:
        async def execute(self, _query):
            class Result:
                def scalars(self_inner):
                    class Rows:
                        def all(self_rows):
                            return [owner, assignee, other]

                    return Rows()

            return Result()

        def add(self, row):
            added.append(row.user_id)

    booking = SimpleNamespace(
        id="b1",
        assigned_user_id="staff-1",
        start_at=datetime(2026, 8, 26, 10, 0, tzinfo=UTC),
        guest_first_name="Ada",
        guest_last_name="Okafor",
    )
    tenant = SimpleNamespace(id="t1")
    client = SimpleNamespace(full_name="Ada Okafor", first_name="Ada", last_name="Okafor")
    service = SimpleNamespace(name="Cut")

    primary = asyncio.run(
        create_booking_notifications(
            FakeSession(),
            tenant=tenant,
            booking=booking,
            client=client,
            service=service,
        )
    )
    assert primary is owner
    assert set(added) == {"owner", "staff-1"}
    assert "staff-2" not in added


def test_listing_slot_stays_unique_across_staff() -> None:
    start = datetime(2026, 8, 26, 10, 0, tzinfo=UTC)
    end = start + timedelta(hours=1)
    listing_booking = SimpleNamespace(
        assigned_user_id="staff-b",
        listing_id="car-1",
        start_at=start,
        end_at=end,
    )
    assert assignment_blocks_slot(
        listing_booking,
        user_id="staff-a",
        listing_id="car-1",
        start_at=start,
        end_at=end,
        buffer_minutes=0,
    )


def test_serialize_staff_member_marks_owner() -> None:
    owner = SimpleNamespace(
        id="u1",
        full_name="Ada Okeke",
        email="ada@example.com",
        job_title=None,
        is_active=True,
        role=UserRole.tenant_admin,
        staff_role=None,
        is_bookable=True,
    )
    payload = serialize_staff_member(owner)
    assert payload["is_owner"] is True
    assert payload["is_bookable"] is True
    assert payload["job_title"] == "Owner"


def test_staff_cannot_see_another_members_booking() -> None:
    from fastapi import HTTPException

    from app.core.deps import CurrentUser
    from app.modules.bookings.router import _assert_booking_visible

    staff = CurrentUser(
        id="staff-1",
        tenant_id="t1",
        role=UserRole.tenant_user.value,
        staff_role=StaffRole.staff.value,
        is_owner=False,
        permissions=permissions_for(role=UserRole.tenant_user, staff_role=StaffRole.staff),
    )
    booking = SimpleNamespace(assigned_user_id="staff-2")
    try:
        _assert_booking_visible(staff, booking)
        raise AssertionError("expected 403")
    except HTTPException as exc:
        assert exc.status_code == 403

    own = SimpleNamespace(assigned_user_id="staff-1")
    _assert_booking_visible(staff, own)


def test_booking_host_prefers_assignee_snapshot() -> None:
    from app.modules.team.staff import booking_host_name, booking_host_title

    booking = SimpleNamespace(assigned_name="Kwame", assigned_title="Stylist")
    service = SimpleNamespace(host_name="Old Host", host_title="Owner")
    assert booking_host_name(booking, service) == "Kwame"
    assert booking_host_title(booking, service) == "Stylist"
    legacy = SimpleNamespace(assigned_name=None, assigned_title=None)
    assert booking_host_name(legacy, service) == "Old Host"


def test_service_payload_includes_staff() -> None:
    from app.infra.models import ServiceBookingType
    from app.modules.services.helpers import service_to_dict

    staff = SimpleNamespace(
        id="u2",
        full_name="Bo Mensah",
        job_title="Stylist",
        is_active=True,
        role=UserRole.tenant_user,
        staff_role=StaffRole.staff,
        is_bookable=True,
    )
    service = SimpleNamespace(
        id="svc-1",
        name="Cut",
        description="",
        duration_minutes=60,
        booking_type=ServiceBookingType.general,
        scheduling_mode=SimpleNamespace(value="fixed"),
        price_amount=50,
        deposit_amount=0,
        appointment_type=SimpleNamespace(value="onsite"),
        location=None,
        use_business_location=True,
        host_name=None,
        host_title=None,
        client_instructions="",
        buffer_minutes=0,
        image_url=None,
        listings=[],
        staff=[staff],
    )
    payload = service_to_dict(service)
    assert payload["staff_ids"] == ["u2"]
    assert payload["staff"][0]["full_name"] == "Bo Mensah"
    assert payload["staff"][0]["is_bookable"] is True


def test_anyone_order_is_title_then_name() -> None:
    ordered = sorted(
        [
            SimpleNamespace(job_title="Stylist", full_name="Zed"),
            SimpleNamespace(job_title="Owner", full_name="Ada"),
        ],
        key=staff_sort_key,
    )
    assert ordered[0].full_name == "Ada"

