import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test, { after, before } from "node:test";

import { Client } from "pg";

// Exercises the HTTP endpoint against a running app (e.g. `npm run dev`).
// Set ORGALIFE_BASE_URL=http://localhost:3000 to run it; skipped otherwise.
const baseUrl = process.env.ORGALIFE_BASE_URL;
const connectionString = process.env.DATABASE_URL;
const skip = !baseUrl || !connectionString ? "ORGALIFE_BASE_URL and DATABASE_URL are required" : false;

const CODE = "CZK";
const NAME = "Integration Persona";
const PERSON_ACCOUNT_ID = "people-api-integration-person-account";
const ASSET_ACCOUNT_ID = "people-api-integration-asset-account";
const ENTRY_IDS = ["people-api-integration-lend", "people-api-integration-repay"];
const SESSION_ID = "people-api-integration-session";
const token = randomBytes(32).toString("base64url");
let client;
let codeExisted = false;

function api(path, init = {}) {
  return fetch(`${baseUrl}/api/finance/v1${path}`, {
    ...init,
    headers: { ...init.headers, cookie: `orgalife-session=${token}`, "Content-Type": "application/json" },
  });
}

async function cleanup() {
  await client.query('DELETE FROM "Posting" WHERE "journalEntryId" = ANY($1)', [ENTRY_IDS]);
  await client.query('DELETE FROM "JournalEntry" WHERE id = ANY($1)', [ENTRY_IDS]);
  await client.query('DELETE FROM "LedgerAccount" WHERE id = ANY($1)', [[PERSON_ACCOUNT_ID, ASSET_ACCOUNT_ID]]);
  await client.query(`DELETE FROM "Person" WHERE name ILIKE 'Integration Persona%'`);
}

async function postEntry(id, personSide, assetSide) {
  await client.query(
    `INSERT INTO "JournalEntry" (id, "operationType", source, "occurredOn", description, "updatedAt")
     VALUES ($1, 'ADJUSTMENT', 'MANUAL', DATE '2026-09-30', 'People integration', NOW())`,
    [id]
  );
  await client.query(
    `INSERT INTO "Posting" (id, "journalEntryId", "ledgerAccountId", side, amount) VALUES
     ($1 || '-person', $1, $2, $3::"PostingSide", 20), ($1 || '-asset', $1, $4, $5::"PostingSide", 20)`,
    [id, PERSON_ACCOUNT_ID, personSide, ASSET_ACCOUNT_ID, assetSide]
  );
}

before(async () => {
  if (skip) return;
  client = new Client({ connectionString });
  await client.connect();
  await cleanup();
  codeExisted =
    (await client.query('SELECT 1 FROM "EnabledCurrency" WHERE code = $1', [CODE])).rowCount > 0;
  await client.query('INSERT INTO "EnabledCurrency" (code) VALUES ($1) ON CONFLICT DO NOTHING', [CODE]);
  await client.query(
    `INSERT INTO "Session" (id, "tokenHash", "expiresAt") VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [SESSION_ID, createHash("sha256").update(token).digest("hex")]
  );
});

after(async () => {
  if (skip) return;
  await cleanup();
  await client.query('DELETE FROM "Session" WHERE id = $1', [SESSION_ID]);
  if (!codeExisted) await client.query('DELETE FROM "EnabledCurrency" WHERE code = $1', [CODE]);
  await client.end();
});

test("creates, renames and deletes a person without accounts", { skip }, async () => {
  const created = await api("/people", { method: "POST", body: JSON.stringify({ name: `  ${NAME}  ` }) });
  assert.equal(created.status, 201);
  const person = await created.json();
  assert.equal(person.name, NAME);
  assert.deepEqual(person.balances, []);

  const duplicate = await api("/people", { method: "POST", body: JSON.stringify({ name: NAME.toUpperCase() }) });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, "PERSON_EXISTS");

  const empty = await api("/people", { method: "POST", body: JSON.stringify({ name: " " }) });
  assert.equal(empty.status, 422);
  assert.equal((await empty.json()).error.code, "PERSON_NAME_REQUIRED");

  const renamed = await api(`/people/${person.id}`, { method: "PATCH", body: JSON.stringify({ name: `${NAME} B` }) });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).name, `${NAME} B`);
  assert.ok((await (await api("/people")).json()).some((item) => item.name === `${NAME} B`));

  const removed = await api(`/people/${person.id}`, { method: "DELETE" });
  assert.deepEqual(await removed.json(), { result: "DELETED" });
  assert.ok(!(await (await api("/people")).json()).some((item) => item.id === person.id));
  const missing = await api(`/people/${person.id}`, { method: "DELETE" });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "PERSON_NOT_FOUND");
});

test("archives a person only with zero balance and blocks removing their currency meanwhile", { skip }, async () => {
  const person = await (await api("/people", { method: "POST", body: JSON.stringify({ name: NAME }) })).json();
  await client.query(
    `INSERT INTO "LedgerAccount" (id, name, currency, kind, subtype, "personId", "updatedAt") VALUES
     ($1, 'Integration Persona CZK', $3, 'RECEIVABLE', 'PERSON', $4, NOW()),
     ($2, 'Integration asset CZK', $3, 'ASSET', 'BANK', NULL, NOW())`,
    [PERSON_ACCOUNT_ID, ASSET_ACCOUNT_ID, CODE, person.id]
  );
  // Inactive, so only the person's balance can block removing the currency.
  await client.query('UPDATE "LedgerAccount" SET "isActive" = false WHERE id = $1', [ASSET_ACCOUNT_ID]);
  await postEntry(ENTRY_IDS[0], "DEBIT", "CREDIT");

  const accounts = await (await api("/accounts")).json();
  assert.ok(!accounts.some((account) => account.id === PERSON_ACCOUNT_ID), "person accounts stay out of Cuentas");

  const listed = (await (await api("/people")).json()).find((item) => item.id === person.id);
  assert.deepEqual(listed.balances, [{ currency: CODE, balance: "20.00" }]);

  const blocked = await api(`/people/${person.id}`, { method: "DELETE" });
  assert.equal(blocked.status, 409);
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.error.code, "PERSON_HAS_BALANCE");
  assert.match(blockedBody.error.message, /20\.00 CZK/);

  const currencyBlocked = await api(`/currencies/${CODE}`, { method: "DELETE" });
  assert.equal(currencyBlocked.status, 409);
  assert.match((await currencyBlocked.json()).error.message, /Integration Persona/);

  await postEntry(ENTRY_IDS[1], "CREDIT", "DEBIT");
  assert.deepEqual(
    (await (await api("/people")).json()).find((item) => item.id === person.id).balances,
    []
  );
  assert.equal((await api(`/currencies/${CODE}`, { method: "DELETE" })).status, 204);
  await client.query('INSERT INTO "EnabledCurrency" (code) VALUES ($1) ON CONFLICT DO NOTHING', [CODE]);

  const archived = await api(`/people/${person.id}`, { method: "DELETE" });
  assert.deepEqual(await archived.json(), { result: "ARCHIVED" });
  assert.ok(!(await (await api("/people")).json()).some((item) => item.id === person.id));
  const account = await client.query('SELECT "isActive" FROM "LedgerAccount" WHERE id = $1', [PERSON_ACCOUNT_ID]);
  assert.equal(account.rows[0].isActive, false);
  const row = await client.query('SELECT "archivedAt" FROM "Person" WHERE id = $1', [person.id]);
  assert.ok(row.rows[0].archivedAt);
});
