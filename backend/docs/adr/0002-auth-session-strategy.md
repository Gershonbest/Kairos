# ADR 0002: Authentication and session strategy

## Status
Accepted

## Context
The platform requires secure access for tenant users and platform admins, while keeping APIs stateless and scalable.

## Decision
- Use JWT access tokens (short TTL) and rotating refresh tokens.
- Store refresh token metadata server-side to support revocation and rotation safety.
- Use role-based authorization with explicit scopes (`tenant_user`, `tenant_admin`, `platform_admin`).
- Hash passwords with Argon2.

## Consequences
- Stateless access token validation supports horizontal scaling.
- Refresh token persistence enables secure logout and incident response.
- Requires robust token rotation logic and audit logging for authentication events.
