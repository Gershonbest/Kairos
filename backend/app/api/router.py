"""Aggregates and mounts all API v1 route modules."""

from fastapi import APIRouter

from app.modules.admin.router import router as admin_router
from app.modules.ai.router import router as ai_router
from app.modules.auth.router import router as auth_router
from app.modules.availability.router import router as availability_router
from app.modules.bookings.router import router as bookings_router
from app.modules.clients.router import router as clients_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.notifications.router import router as notifications_router
from app.modules.payments.router import router as payments_router
from app.modules.public.router import router as public_router
from app.modules.scheduling.router import router as scheduling_router
from app.modules.services.router import router as services_router
from app.modules.subscriptions.router import router as subscriptions_router
from app.modules.tenants.router import router as tenants_router
from app.modules.uploads.router import router as uploads_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(public_router, tags=["public"])
api_router.include_router(tenants_router, prefix="/tenants", tags=["tenants"])
api_router.include_router(uploads_router, prefix="/uploads", tags=["uploads"])
api_router.include_router(scheduling_router, prefix="/scheduling", tags=["scheduling"])
api_router.include_router(subscriptions_router, prefix="/subscriptions", tags=["subscriptions"])
api_router.include_router(services_router, prefix="/services", tags=["services"])
api_router.include_router(availability_router, prefix="/availability", tags=["availability"])
api_router.include_router(bookings_router, prefix="/bookings", tags=["bookings"])
api_router.include_router(clients_router, prefix="/clients", tags=["clients"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(payments_router, prefix="/payments", tags=["payments"])
api_router.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
api_router.include_router(ai_router, prefix="/ai", tags=["ai"])
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])
