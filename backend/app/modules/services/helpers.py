"""Helpers for resolving service appointment display details."""

from app.infra.models import AppointmentFormat, AppointmentType, Service, Tenant
from app.modules.tenants.helpers import tenant_display_location


def resolve_appointment_format(
    service: Service,
    requested_format: AppointmentFormat | None,
) -> AppointmentFormat:
    if service.appointment_type == AppointmentType.online:
        return AppointmentFormat.online
    if service.appointment_type == AppointmentType.onsite:
        return AppointmentFormat.onsite
    if requested_format is None:
        raise ValueError("Appointment format is required for hybrid services")
    return requested_format


def resolve_service_location(service: Service, tenant: Tenant, appointment_format: AppointmentFormat) -> str | None:
    if appointment_format == AppointmentFormat.online:
        if service.online_meeting_link:
            return f"Online: {service.online_meeting_link}"
        return "Online appointment"
    if service.use_business_location:
        tenant_location = tenant_display_location(tenant)
        if tenant_location:
            return tenant_location
    return service.location or tenant_display_location(tenant)


def service_to_dict(service: Service, *, include_meeting_link: bool = False) -> dict:
    payload = {
        "id": service.id,
        "name": service.name,
        "description": service.description,
        "duration_minutes": service.duration_minutes,
        "scheduling_mode": service.scheduling_mode.value,
        "price_amount": float(service.price_amount),
        "deposit_amount": float(service.deposit_amount) if service.deposit_amount is not None else None,
        "appointment_type": service.appointment_type.value,
        "location": service.location,
        "use_business_location": service.use_business_location,
        "host_name": service.host_name,
        "host_title": service.host_title,
        "client_instructions": service.client_instructions,
        "buffer_minutes": service.buffer_minutes,
        "image_url": service.image_url,
    }
    if include_meeting_link:
        payload["online_meeting_link"] = service.online_meeting_link
    return payload
