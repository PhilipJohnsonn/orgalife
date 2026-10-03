import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { after, before } from "node:test";

import { Client } from "pg";

// Exercises the login endpoints against a running app (e.g. `npm run dev`).
// Needs ORGALIFE_BASE_URL, DATABASE_URL and the app's AUTH_PASSWORD; skipped otherwise.
const baseUrl = process.env.ORGALIFE_BASE_URL;
const connectionString = process.env.DATABASE_URL;
const password = process.env.AUTH_PASSWORD;
const skip = !baseUrl || !connectionString || !password ? "ORGALIFE_BASE_URL, DATABASE_URL and AUTH_PASSWORD are required" : false;

const tokenHashes = [];
let client;

before(async () => {
  if (skip) return;
  client = new Client({ connectionString });
  await client.connect();
});

after(async () => {
  if (skip) return;
  await client.query('DELETE FROM "Session" WHERE "tokenHash" = ANY($1)', [tokenHashes]);
  await client.end();
});

function sessionCookie(response) {
  const header = response.headers.getSetCookie().find((cookie) => cookie.startsWith("orgalife-session="));
  return header?.split(";")[0].slice("orgalife-session=".length) ?? null;
}

test("password login stores only the hash of a new opaque session", { skip }, async () => {
  const response = await fetch(`${baseUrl}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(response.status, 200);
  const token = sessionCookie(response);
  assert.ok(token);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  tokenHashes.push(tokenHash);

  const stored = await client.query('SELECT "revokedAt", "expiresAt" > NOW() AS active FROM "Session" WHERE "tokenHash" = $1', [tokenHash]);
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].revokedAt, null);
  assert.equal(stored.rows[0].active, true);

  const accounts = await fetch(`${baseUrl}/api/finance/v1/accounts`, { headers: { cookie: `orgalife-session=${token}` } });
  assert.equal(accounts.status, 200);
});

test("a wrong password creates no session", { skip }, async () => {
  const response = await fetch(`${baseUrl}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: `${password}-wrong` }),
  });
  assert.equal(response.status, 401);
  assert.equal(sessionCookie(response), null);
});

test("Google login without a stored request goes back to the login page", { skip }, async () => {
  const response = await fetch(`${baseUrl}/api/auth/google/callback?code=x&state=y`, { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location"), /\/login\?error=google$/);
  assert.equal(sessionCookie(response), null);
});
