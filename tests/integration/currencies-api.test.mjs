import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test, { after, before } from "node:test";

import { Client } from "pg";

// Exercises the HTTP endpoint against a running app (e.g. `npm run dev`).
// Set ORGALIFE_BASE_URL=http://localhost:3000 to run it; skipped otherwise.
const baseUrl = process.env.ORGALIFE_BASE_URL;
const connectionString = process.env.DATABASE_URL;
const skip = !baseUrl || !connectionString ? "ORGALIFE_BASE_URL and DATABASE_URL are required" : false;

const CODE = "ISK";
const ACCOUNT_ID = "currencies-api-integration-account";
const SESSION_ID = "currencies-api-integration-session";
const token = randomBytes(32).toString("base64url");
let client;
let codeExisted = false;

function api(path, init = {}) {
  return fetch(`${baseUrl}/api/finance/v1${path}`, {
    ...init,
    headers: { ...init.headers, cookie: `orgalife-session=${token}`, "Content-Type": "application/json" },
  });
}

before(async () => {
  if (skip) return;
  client = new Client({ connectionString });
  await client.connect();
  codeExisted =
    (await client.query('SELECT 1 FROM "EnabledCurrency" WHERE code = $1', [CODE])).rowCount > 0;
  await client.query('DELETE FROM "EnabledCurrency" WHERE code = $1', [CODE]);
  await client.query(
    `INSERT INTO "Session" (id, "tokenHash", "expiresAt") VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [SESSION_ID, createHash("sha256").update(token).digest("hex")]
  );
});

after(async () => {
  if (skip) return;
  await client.query('DELETE FROM "LedgerAccount" WHERE id = $1', [ACCOUNT_ID]);
  await client.query('DELETE FROM "Session" WHERE id = $1', [SESSION_ID]);
  await client.query('DELETE FROM "EnabledCurrency" WHERE code = $1', [CODE]);
  if (codeExisted) await client.query('INSERT INTO "EnabledCurrency" (code) VALUES ($1)', [CODE]);
  await client.end();
});

test("lists, enables and disables currencies", { skip }, async () => {
  const initial = await (await api("/currencies")).json();
  assert.ok(["AUD", "USD", "ARS"].every((code) => initial.includes(code)));
  assert.ok(!initial.includes(CODE));

  const created = await api("/currencies", { method: "POST", body: JSON.stringify({ code: " isk " }) });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { code: CODE });
  assert.ok((await (await api("/currencies")).json()).includes(CODE));

  const duplicate = await api("/currencies", { method: "POST", body: JSON.stringify({ code: CODE }) });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, "CURRENCY_EXISTS");

  const invalid = await api("/currencies", { method: "POST", body: JSON.stringify({ code: "XYZ" }) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "INVALID_CURRENCY");

  const options = await (await api("/quick-capture/options")).json();
  assert.ok(options.currencies.includes(CODE));

  assert.equal((await api(`/currencies/${CODE}`, { method: "DELETE" })).status, 204);
  const missing = await api(`/currencies/${CODE}`, { method: "DELETE" });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "CURRENCY_NOT_FOUND");
});

test("blocks disabling a currency used by an active account", { skip }, async () => {
  assert.equal(
    (await api("/currencies", { method: "POST", body: JSON.stringify({ code: CODE }) })).status,
    201
  );
  await client.query(
    `INSERT INTO "LedgerAccount" (id, name, currency, kind, subtype, "updatedAt")
     VALUES ($1, 'Integration ISK', $2, 'ASSET', 'BANK', NOW())`,
    [ACCOUNT_ID, CODE]
  );

  const blocked = await api(`/currencies/${CODE}`, { method: "DELETE" });
  assert.equal(blocked.status, 409);
  const body = await blocked.json();
  assert.equal(body.error.code, "CURRENCY_IN_USE");
  assert.match(body.error.message, /Integration ISK/);

  await client.query('UPDATE "LedgerAccount" SET "isActive" = false WHERE id = $1', [ACCOUNT_ID]);
  assert.equal((await api(`/currencies/${CODE}`, { method: "DELETE" })).status, 204);
});
