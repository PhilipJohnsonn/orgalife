import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const COOKIE_NAME = "orgalife-session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionState = {
  expiresAt: Date;
  revokedAt: Date | null;
};

function secureEqual(first: string, second: string) {
  const firstHash = createHash("sha256").update(first).digest();
  const secondHash = createHash("sha256").update(second).digest();

  return timingSafeEqual(firstHash, secondHash);
}

export function createOpaqueSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordMatches(candidate: unknown, configured?: string) {
  if (typeof candidate !== "string" || !configured) return false;

  return secureEqual(candidate, configured);
}

export function sessionIsActive(session: SessionState | null, now = new Date()) {
  return Boolean(
    session && !session.revokedAt && session.expiresAt.getTime() > now.getTime()
  );
}

const MCP_API_PREFIXES = [
  "/api/boards",
  "/api/columns",
  "/api/tasks",
  "/api/subtasks",
  "/api/tags",
] as const;

export function isMcpPathAllowed(pathname: string) {
  return MCP_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function bearerMatches(header: string | null, configured?: string) {
  if (!configured || !header?.startsWith("Bearer ")) return false;

  return secureEqual(header.slice("Bearer ".length), configured);
}

export function mcpBearerDecision(
  header: string | null,
  configured: string | undefined,
  pathname: string
) {
  if (!bearerMatches(header, configured)) return null;

  return isMcpPathAllowed(pathname) ? "allow" : "forbid";
}

/** @deprecated Legacy tokens are retained only for the uncommitted Google spike and are never accepted. */
export function createSessionToken(password?: string, secret?: string) {
  if (!password || !secret) return null;
  return createHmac("sha256", secret).update(password).digest("hex");
}
