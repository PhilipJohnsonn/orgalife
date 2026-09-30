import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { Client } from "pg";

// Exercises the HTTP endpoint against a running app (e.g. `npm run dev`).
// Set ORGALIFE_BASE_URL=http://localhost:3000 to run it; skipped otherwise.
const baseUrl = process.env.ORGALIFE_BASE_URL;
const connectionString = process.env.DATABASE_URL;
const skip = !baseUrl || !connectionString ? "ORGALIFE_BASE_URL and DATABASE_URL are required" : false;

const PREFIX = "shared-expense-integration";
const ANA = `${PREFIX}-ana`;
const BETO = `${PREFIX}-beto`;
const ARCHIVED = `${PREFIX}-archived`;
const ACCOUNT_ID = `${PREFIX}-account`;
const INACTIVE_ACCOUNT_ID = `${PREFIX}-inactive`;
const SESSION_ID = `${PREFIX}-session`;
const token = randomBytes(32).toString("base64url");
const entryIds = [];
let client;
let eurExisted = false;

function api(path, init = {}) {
  return fetch(`${baseUrl}/api/finance/v1${path}`, {
    ...init,
    headers: { ...init.headers, cookie: `orgalife-session=${token}`, "Content-Type": "application/json" },
  });
}

async function record(body) {
  const response = await api("/shared-expenses", {
    method: "POST",
    body: JSON.stringify({ description: "Integration shared", idempotencyKey: randomUUID(), ...body }),
  });
  const json = await response.json();
  if (response.status === 201) entryIds.push(json.id);
  return { status: response.status, body: json };
}

async function postingsOf(entryId) {
  const result = await client.query(
    `SELECT a.kind, a.subtype, a."personId", a.currency, p.side, p.amount::text AS amount
     FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."ledgerAccountId"
     WHERE p."journalEntryId" = $1 ORDER BY a.kind::text, a."personId" NULLS FIRST`,
    [entryId]
  );
  return result.rows.map((row) => ({ ...row, currency: row.currency.trim() }));
}

function assertBalanced(postings) {
  const debit = postings.filter((p) => p.side === "DEBIT").reduce((acc, p) => acc + Number(p.amount), 0);
  const credit = postings.filter((p) => p.side === "CREDIT").reduce((acc, p) => acc + Number(p.amount), 0);
  assert.equal(debit.toFixed(2), credit.toFixed(2));
}

before(async () => {
  if (skip) return;
  client = new Client({ connectionString });
  await client.connect();
  eurExisted = (await client.query(`SELECT 1 FROM "EnabledCurrency" WHERE code = 'EUR'`)).rowCount > 0;
  await client.query(`INSERT INTO "EnabledCurrency" (code) VALUES ('EUR') ON CONFLICT DO NOTHING`);
  await client.query(
    `INSERT INTO "Person" (id, name, "archivedAt", "updatedAt") VALUES
     ($1, 'Integration Ana', NULL, NOW()), ($2, 'Integration Beto', NULL, NOW()), ($3, 'Integration Archivada', NOW(), NOW())`,
    [ANA, BETO, ARCHIVED]
  );
  await client.query(
    `INSERT INTO "LedgerAccount" (id, name, currency, kind, subtype, "isActive", "updatedAt") VALUES
     ($1, 'Integration shared AUD', 'AUD', 'ASSET', 'BANK', true, NOW()),
     ($2, 'Integration inactive AUD', 'AUD', 'ASSET', 'BANK', false, NOW())`,
    [ACCOUNT_ID, INACTIVE_ACCOUNT_ID]
  );
  await client.query(
    `INSERT INTO "Session" (id, "tokenHash", "expiresAt") VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [SESSION_ID, createHash("sha256").update(token).digest("hex")]
  );
});

after(async () => {
  if (skip) return;
  await client.query('DELETE FROM "Posting" WHERE "journalEntryId" = ANY($1)', [entryIds]);
  await client.query('DELETE FROM "JournalEntry" WHERE id = ANY($1)', [entryIds]);
  await client.query('DELETE FROM "LedgerAccount" WHERE id = ANY($1) OR "personId" = ANY($2)', [
    [ACCOUNT_ID, INACTIVE_ACCOUNT_ID],
    [ANA, BETO, ARCHIVED],
  ]);
  await client.query('DELETE FROM "Person" WHERE id = ANY($1)', [[ANA, BETO, ARCHIVED]]);
  await client.query('DELETE FROM "Session" WHERE id = $1', [SESSION_ID]);
  if (!eurExisted) await client.query(`DELETE FROM "EnabledCurrency" WHERE code = 'EUR'`);
  await client.end();
});

test("paid by you, split between 3: expense is your part and each person owes theirs", { skip }, async () => {
  const idempotencyKey = randomUUID();
  const body = {
    amount: "100.00",
    occurredOn: "2031-01-15",
    idempotencyKey,
    paidBy: { accountId: ACCOUNT_ID },
    split: { mode: "EQUAL", people: [{ personId: ANA }, { personId: BETO }] },
  };
  const created = await record(body);
  assert.equal(created.status, 201);

  const postings = await postingsOf(created.body.id);
  assertBalanced(postings);
  assert.deepEqual(
    postings.map(({ kind, personId, side, amount, currency }) => ({ kind, personId, side, amount, currency })),
    [
      { kind: "ASSET", personId: null, side: "CREDIT", amount: "100.00", currency: "AUD" },
      { kind: "EXPENSE", personId: null, side: "DEBIT", amount: "33.34", currency: "AUD" },
      { kind: "RECEIVABLE", personId: ANA, side: "DEBIT", amount: "33.33", currency: "AUD" },
      { kind: "RECEIVABLE", personId: BETO, side: "DEBIT", amount: "33.33", currency: "AUD" },
    ]
  );

  const again = await record(body);
  assert.equal(again.body.id, created.body.id, "same idempotencyKey returns the same entry");
  assert.equal(entryIds.filter((id) => id === created.body.id).length, 2);

  const summary = await (await api("/monthly-summary?month=2031-01")).json();
  assert.deepEqual(summary.current.native.expenses, [{ currency: "AUD", amount: "33.34" }]);

  const people = await (await api("/people")).json();
  assert.deepEqual(people.find((person) => person.id === ANA).balances, [{ currency: "AUD", balance: "33.33" }]);
});

test("paid by someone else in a foreign currency: only your part, owed to them", { skip }, async () => {
  const created = await record({
    amount: "60.00",
    occurredOn: "2031-02-10",
    paidBy: { personId: ANA, currency: "EUR" },
    split: { mode: "EQUAL", people: [{ personId: ANA }, { personId: BETO }] },
  });
  assert.equal(created.status, 201);
  const postings = await postingsOf(created.body.id);
  assertBalanced(postings);
  assert.deepEqual(
    postings.map(({ kind, personId, side, amount, currency }) => ({ kind, personId, side, amount, currency })),
    [
      { kind: "EXPENSE", personId: null, side: "DEBIT", amount: "20.00", currency: "EUR" },
      { kind: "RECEIVABLE", personId: ANA, side: "CREDIT", amount: "20.00", currency: "EUR" },
    ]
  );

  const ana = (await (await api("/people")).json()).find((person) => person.id === ANA);
  assert.deepEqual(ana.balances, [
    { currency: "AUD", balance: "33.33" },
    { currency: "EUR", balance: "-20.00" },
  ]);
  const summary = await (await api("/monthly-summary?month=2031-02")).json();
  assert.deepEqual(summary.current.native.expenses, [{ currency: "EUR", amount: "20.00" }]);
});

test("exact amounts with nothing for you records no expense", { skip }, async () => {
  const created = await record({
    amount: "50.00",
    occurredOn: "2031-03-05",
    paidBy: { accountId: ACCOUNT_ID },
    split: { mode: "AMOUNTS", me: "0", people: [{ personId: BETO, value: "50.00" }] },
  });
  assert.equal(created.status, 201);
  const postings = await postingsOf(created.body.id);
  assertBalanced(postings);
  assert.ok(!postings.some((posting) => posting.kind === "EXPENSE"));
});

test("rejects archived people, inactive accounts and disabled currencies", { skip }, async () => {
  const base = { amount: "10.00", occurredOn: "2031-04-01", split: { mode: "EQUAL", people: [{ personId: ANA }] } };

  const archived = await record({ ...base, paidBy: { accountId: ACCOUNT_ID }, split: { mode: "EQUAL", people: [{ personId: ARCHIVED }] } });
  assert.equal(archived.status, 422);
  assert.equal(archived.body.error.code, "PERSON_NOT_FOUND");

  const inactive = await record({ ...base, paidBy: { accountId: INACTIVE_ACCOUNT_ID } });
  assert.equal(inactive.status, 400);
  assert.equal(inactive.body.error.code, "LEDGER_INVALID_ACCOUNT_KIND");

  const disabled = await record({ ...base, paidBy: { personId: ANA, currency: "NOK" } });
  assert.equal(disabled.status, 422);
  assert.equal(disabled.body.error.code, "CURRENCY_NOT_ENABLED");

  const mismatch = await record({
    ...base,
    paidBy: { accountId: ACCOUNT_ID },
    split: { mode: "AMOUNTS", me: "5", people: [{ personId: ANA, value: "4" }] },
  });
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.body.error.code, "SPLIT_MISMATCH");
});
