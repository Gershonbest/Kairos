"""Build tenant knowledge documents for RAG indexing."""

from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.models import (
    AvailabilityRule,
    KnowledgeDocumentStatus,
    Service,
    Tenant,
    TenantFaq,
    TenantKnowledgeDocument,
)
from app.modules.ai.knowledge.chunking import chunk_text
from app.modules.ai.vector.base import KnowledgeDocument
from app.modules.tenants.helpers import tenant_display_location


def _doc_id(tenant_id: str, source: str, key: str) -> str:
    digest = hashlib.sha1(f"{tenant_id}:{source}:{key}".encode()).hexdigest()[:32]
    return f"kb_{digest}"


async def build_tenant_documents(session: AsyncSession, tenant_id: str) -> list[KnowledgeDocument]:
    tenant = (
        await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()
    if not tenant:
        return []

    docs: list[KnowledgeDocument] = []
    location = tenant_display_location(tenant)
    profile_parts = [
        f"Business name: {tenant.name}",
        f"Business type: {tenant.business_type or 'not specified'}",
        f"Tagline: {tenant.public_tagline or 'not specified'}",
        f"Description: {tenant.public_description or 'not specified'}",
        f"Location: {location or tenant.location or 'not specified'}",
        f"Address: {tenant.address_line or 'not specified'}",
        f"Timezone: {tenant.timezone or 'Africa/Lagos'}",
        f"Help email: {tenant.help_email or 'not specified'}",
        f"Phone: {(tenant.phone_country_code or '')}{(tenant.phone_number or '')}".strip() or "not specified",
    ]
    docs.append(
        KnowledgeDocument(
            id=_doc_id(tenant_id, "profile", "main"),
            source="profile",
            content="\n".join(profile_parts),
            metadata={"kind": "profile"},
        )
    )

    if tenant.cancellation_policy:
        docs.append(
            KnowledgeDocument(
                id=_doc_id(tenant_id, "policy", "cancellation"),
                source="policy",
                content=f"Cancellation policy:\n{tenant.cancellation_policy}",
                metadata={"kind": "cancellation_policy"},
            )
        )
    if tenant.booking_policies:
        docs.append(
            KnowledgeDocument(
                id=_doc_id(tenant_id, "policy", "booking"),
                source="policy",
                content=f"Booking policies:\n{tenant.booking_policies}",
                metadata={"kind": "booking_policies"},
            )
        )

    services = (
        await session.execute(
            select(Service).where(Service.tenant_id == tenant_id, Service.active.is_(True))
        )
    ).scalars().all()
    for service in services:
        content = (
            f"Service: {service.name}\n"
            f"Duration: {service.duration_minutes} minutes\n"
            f"Price: {float(service.price_amount or 0):.2f} NGN\n"
            f"Deposit: {float(service.deposit_amount or 0):.2f} NGN\n"
            f"Appointment type: {service.appointment_type.value if service.appointment_type else 'onsite'}\n"
            f"Scheduling mode: {service.scheduling_mode.value if service.scheduling_mode else 'fixed'}\n"
            f"Host: {service.host_name or 'not specified'}\n"
            f"Instructions: {service.client_instructions or 'none'}\n"
            f"Location: {service.location or 'business default'}"
        )
        docs.append(
            KnowledgeDocument(
                id=_doc_id(tenant_id, "service", service.id),
                source="service",
                content=content,
                metadata={"kind": "service", "service_id": service.id},
            )
        )

    rules = (
        await session.execute(select(AvailabilityRule).where(AvailabilityRule.tenant_id == tenant_id))
    ).scalars().all()
    if rules:
        day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        lines = ["Business hours:"]
        for rule in sorted(rules, key=lambda row: (row.day_of_week, row.start_time or "")):
            day = day_names[int(rule.day_of_week) % 7]
            if not rule.is_enabled:
                lines.append(f"- {day}: closed")
            else:
                lines.append(f"- {day}: {rule.start_time}–{rule.end_time}")
        docs.append(
            KnowledgeDocument(
                id=_doc_id(tenant_id, "hours", "weekly"),
                source="hours",
                content="\n".join(lines),
                metadata={"kind": "hours"},
            )
        )

    faqs = (
        await session.execute(
            select(TenantFaq)
            .where(TenantFaq.tenant_id == tenant_id)
            .order_by(TenantFaq.sort_order.asc(), TenantFaq.created_at.asc())
        )
    ).scalars().all()
    for faq in faqs:
        docs.append(
            KnowledgeDocument(
                id=_doc_id(tenant_id, "faq", faq.id),
                source="faq",
                content=f"Q: {faq.question}\nA: {faq.answer}",
                metadata={"kind": "faq", "faq_id": faq.id},
            )
        )

    uploaded = (
        await session.execute(
            select(TenantKnowledgeDocument).where(
                TenantKnowledgeDocument.tenant_id == tenant_id,
                TenantKnowledgeDocument.status == KnowledgeDocumentStatus.ready,
            )
        )
    ).scalars().all()
    for doc in uploaded:
        text = (doc.extracted_text or "").strip()
        if not text:
            continue
        for index, chunk in enumerate(chunk_text(text)):
            docs.append(
                KnowledgeDocument(
                    id=_doc_id(tenant_id, "document", f"{doc.id}:{index}"),
                    source="document",
                    content=f"Document: {doc.title}\n\n{chunk}",
                    metadata={
                        "kind": "document",
                        "document_id": doc.id,
                        "title": doc.title,
                        "chunk_index": index,
                    },
                )
            )

    return docs
