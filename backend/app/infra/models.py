"""SQLAlchemy ORM models for tenants, users, bookings, and payments."""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.plans import PlanCode


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
    no_show = "no_show"


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


class ServiceBookingType(str, enum.Enum):
    general = "general"
    listing = "listing"


class ListingStatus(str, enum.Enum):
    available = "available"
    reserved = "reserved"
    sold = "sold"
    hidden = "hidden"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"
    refunded = "refunded"


class NotificationType(str, enum.Enum):
    booking_created = "booking_created"


class OutboundChannel(str, enum.Enum):
    email = "email"
    sms = "sms"
    whatsapp = "whatsapp"
    voice = "voice"


class OutboundPurpose(str, enum.Enum):
    booking_reminder = "booking_reminder"
    booking_confirmation = "booking_confirmation"


class OutboundMessageStatus(str, enum.Enum):
    pending = "pending"
    sending = "sending"
    sent = "sent"
    failed = "failed"
    cancelled = "cancelled"
    skipped = "skipped"


service_listings = Table(
    "service_listings",
    Base.metadata,
    Column("service_id", String(36), ForeignKey("services.id"), primary_key=True),
    Column("listing_id", String(36), ForeignKey("listings.id"), primary_key=True, index=True),
)


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = uuid_pk()
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    business_type: Mapped[str | None] = mapped_column(String(80))
    location: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    plan_code: Mapped[PlanCode] = mapped_column(
        Enum(PlanCode, native_enum=False, length=20),
        default=PlanCode.standard,
        nullable=False,
    )
    public_slug: Mapped[str | None] = mapped_column(String(180), unique=True)
    public_tagline: Mapped[str | None] = mapped_column(String(220))
    public_description: Mapped[str | None] = mapped_column(Text)
    public_logo_url: Mapped[str | None] = mapped_column(String(500))
    help_email: Mapped[str | None] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="Africa/Lagos", nullable=False)
    country_code: Mapped[str | None] = mapped_column(String(2))
    state: Mapped[str | None] = mapped_column(String(120))
    address_line: Mapped[str | None] = mapped_column(String(300))
    phone_country_code: Mapped[str | None] = mapped_column(String(8))
    phone_number: Mapped[str | None] = mapped_column(String(30))
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    branches: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cancellation_policy: Mapped[str | None] = mapped_column(Text)
    booking_policies: Mapped[str | None] = mapped_column(Text)
    payment_provider: Mapped[str | None] = mapped_column(String(40))
    payment_account_id: Mapped[str | None] = mapped_column(String(120))
    payments_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    paystack_subaccount_id: Mapped[str | None] = mapped_column(String(80))
    settlement_bank_code: Mapped[str | None] = mapped_column(String(20))
    settlement_bank_name: Mapped[str | None] = mapped_column(String(120))
    settlement_account_name: Mapped[str | None] = mapped_column(String(200))
    settlement_account_number: Mapped[str | None] = mapped_column(String(20))
    settlement_account_last4: Mapped[str | None] = mapped_column(String(4))
    platform_fee_percent: Mapped[float | None] = mapped_column(Numeric(5, 2))
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


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

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
    booking_type: Mapped[ServiceBookingType] = mapped_column(
        Enum(ServiceBookingType), default=ServiceBookingType.general, nullable=False
    )
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
    listings: Mapped[list["Listing"]] = relationship(secondary=service_listings, back_populates="services")


class Listing(Base):
    __tablename__ = "listings"
    __table_args__ = (Index("ix_listings_tenant_status_active", "tenant_id", "status", "active"),)

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ListingStatus] = mapped_column(
        Enum(ListingStatus), default=ListingStatus.available, nullable=False
    )
    image_urls: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    services: Mapped[list["Service"]] = relationship(secondary=service_listings, back_populates="listings")


class AvailabilityRule(Base):
    __tablename__ = "availability_rules"

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CalendarBlock(Base):
    __tablename__ = "calendar_blocks"

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(String(200))
    created_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_clients_tenant_email"),)

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    first_name: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    last_name: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_booking_idempotency"),
        Index(
            "uq_booking_slot_general",
            "tenant_id",
            "service_id",
            "start_at",
            unique=True,
            postgresql_where=text("listing_id IS NULL AND status IN ('pending'::bookingstatus, 'confirmed'::bookingstatus)"),
        ),
        Index(
            "uq_booking_slot_listing",
            "tenant_id",
            "service_id",
            "listing_id",
            "start_at",
            unique=True,
            postgresql_where=text("listing_id IS NOT NULL AND status IN ('pending'::bookingstatus, 'confirmed'::bookingstatus)"),
        ),
    )

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), nullable=False)
    service_id: Mapped[str] = mapped_column(ForeignKey("services.id"), nullable=False)
    listing_id: Mapped[str | None] = mapped_column(ForeignKey("listings.id"))
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.pending)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_all_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    guest_first_name: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    guest_last_name: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    booking_source: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    created_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    appointment_format: Mapped[AppointmentFormat | None] = mapped_column(Enum(AppointmentFormat))
    balance_waived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    client: Mapped["Client"] = relationship()
    service: Mapped["Service"] = relationship()
    listing: Mapped["Listing | None"] = relationship()


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider_reference", name="uq_payment_provider_reference"),
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_payment_idempotency"),
    )

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    booking_id: Mapped[str | None] = mapped_column(ForeignKey("bookings.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.pending)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="NGN", nullable=False)
    platform_fee_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    tenant_settlement_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    purpose: Mapped[str] = mapped_column(String(40), default="booking", nullable=False)
    authorization_url: Mapped[str | None] = mapped_column(String(500))
    access_code: Mapped[str | None] = mapped_column(String(120))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    code: Mapped[PlanCode] = mapped_column(
        Enum(PlanCode, native_enum=False, length=40), unique=True, nullable=False
    )
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


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_notification_preferences_tenant"),)

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    booking_created_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    payment_received_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sms_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    client_reminder_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    client_reminder_sms: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    client_reminder_whatsapp: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    client_reminder_voice: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_offsets_minutes: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "email": [1440, 120],
            "sms": [1440, 120],
            "whatsapp": [1440, 120],
            "voice": [1440, 120],
        },
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OutboundMessage(Base):
    """Durable outbound reminder (and later transactional) messages."""

    __tablename__ = "outbound_messages"
    __table_args__ = (
        UniqueConstraint(
            "booking_id",
            "channel",
            "purpose",
            "offset_minutes",
            name="uq_outbound_booking_channel_purpose_offset",
        ),
        Index("ix_outbound_messages_due", "status", "scheduled_for"),
    )

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True, nullable=False)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), index=True, nullable=False)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True, nullable=False)
    channel: Mapped[OutboundChannel] = mapped_column(
        Enum(OutboundChannel, native_enum=False, length=20), nullable=False
    )
    purpose: Mapped[OutboundPurpose] = mapped_column(
        Enum(OutboundPurpose, native_enum=False, length=40),
        default=OutboundPurpose.booking_reminder,
        nullable=False,
    )
    offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[OutboundMessageStatus] = mapped_column(
        Enum(OutboundMessageStatus, native_enum=False, length=20),
        default=OutboundMessageStatus.pending,
        nullable=False,
    )
    to_address: Mapped[str] = mapped_column(String(255), nullable=False)
    template_key: Mapped[str] = mapped_column(String(80), default="booking_reminder", nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(40))
    provider_message_id: Mapped[str | None] = mapped_column(String(160))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AuditEvent(Base):
    """Immutable append-only trail for admin and money-affecting actions."""

    __tablename__ = "audit_events"

    id: Mapped[str] = uuid_pk()
    actor_user_id: Mapped[str | None] = mapped_column(String(36), index=True)
    actor_role: Mapped[str | None] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict, nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(400))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class TenantFaq(Base):
    __tablename__ = "tenant_faqs"

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    question: Mapped[str] = mapped_column(String(500), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class KnowledgeDocumentStatus(str, enum.Enum):
    pending = "pending"
    ready = "ready"
    failed = "failed"


class ClientCommunication(Base):
    """Manual outreach log for tenant-to-client emails and calls."""

    __tablename__ = "client_communications"
    __table_args__ = (Index("ix_client_communications_client_created", "client_id", "created_at"),)

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), nullable=False, index=True)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="sent", nullable=False)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(String(500))
    template_id: Mapped[str | None] = mapped_column(String(80))
    template_name: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClientEmailTemplate(Base):
    """Reusable email templates for tenant-to-client outreach."""

    __tablename__ = "client_email_templates"
    __table_args__ = (Index("ix_client_email_templates_tenant", "tenant_id"),)

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TenantKnowledgeDocument(Base):
    """Owner-uploaded business documents used for AI RAG."""

    __tablename__ = "tenant_knowledge_documents"
    __table_args__ = (Index("ix_tenant_knowledge_documents_tenant", "tenant_id"),)

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    storage_url: Mapped[str] = mapped_column(String(500), nullable=False)
    extracted_text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[KnowledgeDocumentStatus] = mapped_column(
        Enum(KnowledgeDocumentStatus, native_enum=False, length=20),
        default=KnowledgeDocumentStatus.pending,
        nullable=False,
    )
    error_message: Mapped[str | None] = mapped_column(String(500))
    byte_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AiKnowledgeChunk(Base):
    """Tenant-scoped RAG chunks. embedding uses pgvector when available."""

    __tablename__ = "ai_knowledge_chunks"
    __table_args__ = (Index("ix_ai_knowledge_chunks_tenant_source", "tenant_id", "source"),)

    id: Mapped[str] = uuid_pk()
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
