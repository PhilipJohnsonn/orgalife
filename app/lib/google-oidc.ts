import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/** Holds state, nonce and the PKCE verifier between the redirect to Google and the callback. */
export const GOOGLE_AUTH_COOKIE = "orgalife-google-auth";
export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  allowedEmail: string;
  redirectUri: string;
  baseUrl: string;
};

/** Null unless every variable is set: Google login stays off rather than half-configured. */
export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const allowedEmail = env.GOOGLE_ALLOWED_EMAIL?.trim().toLowerCase();
  const baseUrl = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!clientId || !clientSecret || !allowedEmail || !baseUrl) return null;
  return { clientId, clientSecret, allowedEmail, baseUrl, redirectUri: `${baseUrl}/api/auth/google/callback` };
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

/** state (CSRF), nonce (replay) and the PKCE verifier, kept in a short-lived cookie until the callback. */
export function createAuthRequest() {
  return { state: randomToken(), nonce: randomToken(), codeVerifier: randomToken() };
}

export function authorizationUrl(config: GoogleConfig, request: ReturnType<typeof createAuthRequest>) {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", request.state);
  url.searchParams.set("nonce", request.nonce);
  url.searchParams.set("code_challenge", createHash("sha256").update(request.codeVerifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url;
}

let googleKeys: JWTVerifyGetKey | null = null;

/**
 * Accepts the ID token only if Google signed it for this client, it is not
 * expired, it carries our nonce and it belongs to the one allowed, verified email.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string; allowedEmail: string },
  keys: JWTVerifyGetKey = (googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)))
) {
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: GOOGLE_ISSUERS,
    audience: expected.clientId,
  });
  if (payload.nonce !== expected.nonce) return { ok: false as const, reason: "google" as const };
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (payload.email_verified !== true || email !== expected.allowedEmail) {
    return { ok: false as const, reason: "email" as const };
  }
  return { ok: true as const, email };
}
