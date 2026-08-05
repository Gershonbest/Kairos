// JWT payload helpers. Pure functions so both the API client and route
// guards can reason about the session without importing each other.

export interface AccessTokenPayload {
  sub?: string;
  role?: string;
  tenant_id?: string | null;
  type?: string;
  exp?: number;
}

export function decodeToken(token: string | null): AccessTokenPayload | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function tokenExpiresAt(token: string | null): number | null {
  const exp = decodeToken(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

/**
 * Treat a token as expired slightly early so a request never leaves with
 * credentials that die in flight.
 */
export function isTokenExpired(token: string | null, skewSeconds = 15): boolean {
  const expiresAt = tokenExpiresAt(token);
  if (expiresAt === null) return true;
  return Date.now() >= expiresAt - skewSeconds * 1000;
}
