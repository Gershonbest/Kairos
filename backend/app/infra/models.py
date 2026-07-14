"""SQLAlchemy ORM models for tenants, users, bookings, and payments."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def uuid_pk() -> Mapped[str]:
    return mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))


class UserRole(str, enum.Enum):
    tenant_user = "tenant_user"
    tenant_admin = "tenant_admin"
    platform_admin = "platform_admin"


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"


class AppointmentType(str, enum.Enum):
    online = "online"
    onsite = "onsite"
    hybrid = "hybrid"


class AppointmentFormat(str, enum.Enum):
    online = "online"
    onsite = "onsite"


class SchedulingMode(str, enum.Enum):
    fixed = "fixed"
    flexible = "flexible"
    all_day = "all_day"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"
    refunded = "refunded"


class NotificationType(str, enum.Enum):
    booking_created = "booking_created"


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = uuid_pk()
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    business_type: Mapped[str | None] = mapped_column(String(80))
    location: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    plan_code: Mapped[str] = mapped_column(String(20), default="standard", nullable=False)
    public_slug: Mapped[str | None] = mapped_column(String(180), unique=True)
    public_tagline: Mapped[str | None] = mapped_column(String(220))
    public_description: Mapped[str | None] = mapped_column(Text)
    public_logo_url: Mapped[str | None] = mapped_column(String(500))
    country_code: Mapped[str | None] = mapped_column(String(2))
    state: Mapped[str | None] = mapped_column(String(120))
    address_line: Mapped[str | None] = mapped_column(String(300))
    phone_country_code: Mapped[str | None] = mapped_column(String(8))
    phone_number: Mapped[str | None] = mapped_column(String(30))
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    branches: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    payment_provider: Mapped[str | None] = mapped_column(String(40))
    payment_account_id: Mapped[str | None] = mapped_column(String(120))
    payments_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    trial_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_warning_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subscription_paid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id"))
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.tenant_admin, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Service(Base):
    __tablename__ = "services"

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    scheduling_mode: Mapped[SchedulingMode] = mapped_column(
        Enum(SchedulingMode), default=SchedulingMode.fixed, nullable=False
    )
    price_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    deposit_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    appointment_type: Mapped[AppointmentType] = mapped_column(
        Enum(AppointmentType), default=AppointmentType.onsite, nullable=False
    )
    location: Mapped[str | None] = mapped_column(String(300))
    use_business_location: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    host_name: Mapped[str | None] = mapped_column(String(120))
    host_title: Mapped[str | None] = mapped_column(String(80))
    online_meeting_link: Mapped[str | None] = mapped_column(String(500))
    client_instructions: Mapped[str | None] = mapped_column(Text)
    buffer_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AvailabilityRule(Base):
    __tablename__ = "availability_rules"

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_clients_tenant_email"),)

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "service_id", "start_at", name="uq_booking_slot"),
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_booking_idempotency"),
    )

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), nullable=False)
    service_id: Mapped[str] = mapped_column(ForeignKey("services.id"), nullable=False)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.pending)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_all_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    appointment_format: Mapped[AppointmentFormat | None] = mapped_column(Enum(AppointmentFormat))
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["Client"] = relationship()
    service: Mapped["Service"] = relationship()


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider_reference", name="uq_payment_provider_reference"),
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_payment_idempotency"),
    )

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.pending)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    __table_args__ = (UniqueConstraint("provider", "event_id", name="uq_webhook_provider_event"),)

    id: Mapped[str] = uuid_pk()
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    event_id: Mapped[str] = mapped_column(String(160), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[str] = uuid_pk()
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    monthly_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    features: Mapped[list] = mapped_column(JSON, default=list)
    entitlements: Mapped[dict] = mapped_column(JSON, default=dict)
    self_serve: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType), default=NotificationType.booking_created, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    booking_id: Mapped[str | None] = mapped_column(ForeignKey("bookings.id"), index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
