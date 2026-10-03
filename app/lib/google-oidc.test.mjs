import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";

import { authorizationUrl, createAuthRequest, googleConfig, verifyGoogleIdToken } from "./google-oidc.ts";

const env = {
  GOOGLE_CLIENT_ID: "client-1.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_ALLOWED_EMAIL: "Me@Example.com",
  PUBLIC_BASE_URL: "https://orgalife.example.com/",
};

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256" };
const keys = createLocalJWKSet({ keys: [jwk] });
const expected = { clientId: env.GOOGLE_CLIENT_ID, nonce: "nonce-1", allowedEmail: "me@example.com" };

function token(claims = {}, { issuer = "https://accounts.google.com", audience = env.GOOGLE_CLIENT_ID, expiresIn = "5m", key = privateKey } = {}) {
  return new SignJWT({ nonce: "nonce-1", email: "me@example.com", email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

test("Google login is off unless fully configured", () => {
  assert.equal(googleConfig({ ...env, PUBLIC_BASE_URL: "" }), null);
  assert.deepEqual(googleConfig(env), {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: "secret",
    allowedEmail: "me@example.com",
    baseUrl: "https://orgalife.example.com",
    redirectUri: "https://orgalife.example.com/api/auth/google/callback",
  });
});

test("the authorization URL carries state, nonce and an S256 PKCE challenge", () => {
  const request = createAuthRequest();
  const url = authorizationUrl(googleConfig(env), request);
  assert.equal(url.searchParams.get("redirect_uri"), "https://orgalife.example.com/api/auth/google/callback");
  assert.equal(url.searchParams.get("state"), request.state);
  assert.equal(url.searchParams.get("nonce"), request.nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(request.codeVerifier).digest("base64url")
  );
});

test("accepts a valid token for the allowed verified email", async () => {
  assert.deepEqual(await verifyGoogleIdToken(await token(), expected, keys), { ok: true, email: "me@example.com" });
  const shortIssuer = await token({}, { issuer: "accounts.google.com" });
  assert.equal((await verifyGoogleIdToken(shortIssuer, expected, keys)).ok, true);
});

test("rejects other emails, unverified emails and a wrong nonce", async () => {
  assert.deepEqual(await verifyGoogleIdToken(await token({ email: "other@example.com" }), expected, keys), { ok: false, reason: "email" });
  assert.deepEqual(await verifyGoogleIdToken(await token({ email_verified: false }), expected, keys), { ok: false, reason: "email" });
  assert.deepEqual(await verifyGoogleIdToken(await token({ nonce: "replayed" }), expected, keys), { ok: false, reason: "google" });
});

test("rejects bad signatures, other audiences, other issuers and expired tokens", async () => {
  const other = await generateKeyPair("RS256");
  await assert.rejects(verifyGoogleIdToken(await token({}, { key: other.privateKey }), expected, keys));
  await assert.rejects(verifyGoogleIdToken(await token({}, { audience: "someone-else" }), expected, keys));
  await assert.rejects(verifyGoogleIdToken(await token({}, { issuer: "https://evil.example.com" }), expected, keys));
  await assert.rejects(verifyGoogleIdToken(await token({}, { expiresIn: "-1m" }), expected, keys));
});
