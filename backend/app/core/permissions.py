"""Named staff-role permissions for tenant dashboard surfaces."""

from __future__ import annotations

from app.infra.models import StaffRole, UserRole

CALENDAR_OWN = "calendar:own"
CALENDAR_ALL = "calendar:all"
BOOKINGS_REASSIGN = "bookings:reassign"
BOOKINGS_CREATE = "bookings:create"
CLIENTS_READ = "clients:read"
CLIENTS_WRITE = "clients:write"
CLIENTS_ASSIGNED = "clients:assigned"
SERVICES_WRITE = "services:write"
AVAILABILITY_BUSINESS = "availability:business"
AVAILABILITY_OWN = "availability:own"
PAYMENTS_MANAGE = "payments:manage"
TEAM_MANAGE = "team:manage"
SETTINGS_BILLING = "settings:billing"
SETTINGS_DANGER = "settings:danger"

ALL_PERMISSIONS: tuple[str, ...] = (
    CALENDAR_OWN,
    CALENDAR_ALL,
    BOOKINGS_REASSIGN,
    BOOKINGS_CREATE,
    CLIENTS_READ,
    CLIENTS_WRITE,
    CLIENTS_ASSIGNED,
    SERVICES_WRITE,
    AVAILABILITY_BUSINESS,
    AVAILABILITY_OWN,
    PAYMENTS_MANAGE,
    TEAM_MANAGE,
    SETTINGS_BILLING,
    SETTINGS_DANGER,
)

_OWNER_PERMISSIONS = ALL_PERMISSIONS

_MANAGER_PERMISSIONS: tuple[str, ...] = (
    CALENDAR_OWN,
    CALENDAR_ALL,
    BOOKINGS_REASSIGN,
    BOOKINGS_CREATE,
    CLIENTS_READ,
    CLIENTS_WRITE,
    SERVICES_WRITE,
    AVAILABILITY_BUSINESS,
    AVAILABILITY_OWN,
)

_FRONT_DESK_PERMISSIONS: tuple[str, ...] = (
    CALENDAR_OWN,
    CALENDAR_ALL,
    BOOKINGS_REASSIGN,
    BOOKINGS_CREATE,
    CLIENTS_READ,
    CLIENTS_WRITE,
    AVAILABILITY_OWN,
)

_STAFF_PERMISSIONS: tuple[str, ...] = (
    CALENDAR_OWN,
    BOOKINGS_CREATE,
    CLIENTS_ASSIGNED,
    AVAILABILITY_OWN,
)


def is_owner_role(role: str | UserRole | None) -> bool:
    value = role.value if isinstance(role, UserRole) else role
    return value == UserRole.tenant_admin.value


def staff_role_value(staff_role: StaffRole | str | None) -> str | None:
    if staff_role is None:
        return None
    return staff_role.value if isinstance(staff_role, StaffRole) else str(staff_role)


def permissions_for(*, role: str | UserRole, staff_role: StaffRole | str | None) -> tuple[str, ...]:
    if is_owner_role(role):
        return _OWNER_PERMISSIONS
    value = staff_role_value(staff_role)
    if value == StaffRole.manager.value:
        return _MANAGER_PERMISSIONS
    if value == StaffRole.front_desk.value:
        return _FRONT_DESK_PERMISSIONS
    if value == StaffRole.staff.value:
        return _STAFF_PERMISSIONS
    return ()


def has_permission(permissions: tuple[str, ...] | list[str], permission: str) -> bool:
    return permission in permissions


def can_see_all_calendars(permissions: tuple[str, ...] | list[str]) -> bool:
    return has_permission(permissions, CALENDAR_ALL)
