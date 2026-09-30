import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { Client } from "pg";

// Exercises the HTTP endpoint against a running app (e.g. `npm run dev`).
// Set ORGALIFE_BASE_URL=http://localhost:3000 to run it; skipped otherwise.
const baseUrl = process.env.ORGALIFE_BASE_URL;
const connectionString = process.env.DATABASE_URL;
const skip = !baseUrl || !connectionString ? "ORGALIFE_BASE_URL and DATABASE_URL are required" : false;

const PREFIX = "person-settlement-integration";
const ANA = `${PREFIX}-ana`;
const BETO = `${PREFIX}-beto`;
const AUD_ACCOUNT = `${PREFIX}-aud`;
const SESSION_ID = `${PREFIX}-session`;
const MONTH = "2032-05";
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

async function post(path, body) {
  const response = await api(path, {
    method: "POST",
    body: JSON.stringify({ occurredOn: `${MONTH}-10`, idempotencyKey: randomUUID(), ...body }),
  });
  const json = await response.json();
  if (response.status === 201) entryIds.push(json.id);
  return { status: response.status, body: json };
}

const settle = (body) => post("/people/settlements", { accountId: AUD_ACCOUNT, ...body });

async function balanceOf(personId, currency) {
  const person = (await (await api("/people")).json()).find((item) => item.id === personId);
  return person.balances.find((item) => item.currency === currency)?.balance ?? "0.00";
}

async function totalsByCurrency(entryId) {
  const result = await client.query(
    `SELECT TRIM(a.currency) AS currency,
            SUM(CASE WHEN p.side = 'DEBIT' THEN p.amount ELSE -p.amount END)::text AS net
     FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."ledgerAccountId"
     WHERE p."journalEntryId" = $1 GROUP BY 1 ORDER BY 1`,
    [entryId]
  );
  return result.rows;
}

before(async () => {
  if (skip) return;
  client = new Client({ connectionString });
  await client.connect();
  eurExisted = (await client.query(`SELECT 1 FROM "EnabledCurrency" WHERE code = 'EUR'`)).rowCount > 0;
  await client.query(`INSERT INTO "EnabledCurrency" (code) VALUES ('EUR') ON CONFLICT DO NOTHING`);
  await client.query(
    `INSERT INTO "Person" (id, name, "updatedAt") VALUES ($1, 'Integration Ana S', NOW()), ($2, 'Integration Beto S', NOW())`,
    [ANA, BETO]
  );
  await client.query(
    `INSERT INTO "LedgerAccount" (id, name, currency, kind, subtype, "updatedAt")
     VALUES ($1, 'Integration settlement AUD', 'AUD', 'ASSET', 'BANK', NOW())`,
    [AUD_ACCOUNT]
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
  await client.query('DELETE FROM "LedgerAccount" WHERE id = $1 OR "personId" = ANY($2)', [AUD_ACCOUNT, [ANA, BETO]]);
  await client.query('DELETE FROM "Person" WHERE id = ANY($1)', [[ANA, BETO]]);
  await client.query('DELETE FROM "Session" WHERE id = $1', [SESSION_ID]);
  if (!eurExisted) await client.query(`DELETE FROM "EnabledCurrency" WHERE code = 'EUR'`);
  await client.end();
});

test("partial and total settlement in the same currency bring the balance to 0", { skip }, async () => {
  const shared = await post("/shared-expenses", {
    amount: "60.00",
    description: "Integration cena",
    paidBy: { accountId: AUD_ACCOUNT },
    split: { mode: "EQUAL", people: [{ personId: ANA }] },
  });
  assert.equal(shared.status, 201);
  assert.equal(await balanceOf(ANA, "AUD"), "30.00");
  const before = await (await api(`/monthly-summary?month=${MONTH}`)).json();

  const partial = await settle({ personId: ANA, direction: "RECEIVED", amount: "10.00" });
  assert.equal(partial.status, 201);
  assert.equal(partial.body.description, "Integration Ana S te pagó");
  assert.deepEqual(await totalsByCurrency(partial.body.id), [{ currency: "AUD", net: "0.00" }]);
  assert.equal(await balanceOf(ANA, "AUD"), "20.00");

  const exceeds = await settle({ personId: ANA, direction: "RECEIVED", amount: "20.01" });
  assert.equal(exceeds.status, 422);
  assert.equal(exceeds.body.error.code, "SETTLEMENT_EXCEEDS_BALANCE");

  const total = await settle({ personId: ANA, direction: "RECEIVED", amount: "20.00" });
  assert.equal(total.status, 201);
  assert.equal(await balanceOf(ANA, "AUD"), "0.00");

  const again = await settle({ personId: ANA, direction: "RECEIVED", amount: "1.00" });
  assert.equal(again.status, 422);
  assert.equal(again.body.error.code, "SETTLEMENT_WRONG_DIRECTION");

  const after = await (await api(`/monthly-summary?month=${MONTH}`)).json();
  assert.deepEqual(after.current.native, before.current.native, "settlements are neither income nor expense");
});

test("cross-currency settlement goes through FX clearing and zeroes the debt", { skip }, async () => {
  const shared = await post("/shared-expenses", {
    amount: "60.00",
    description: "Integration hotel",
    paidBy: { personId: BETO, currency: "EUR" },
    split: { mode: "EQUAL", people: [{ personId: BETO }] },
  });
  assert.equal(shared.status, 201);
  assert.equal(await balanceOf(BETO, "EUR"), "-30.00");

  const wrongDirection = await settle({ personId: BETO, direction: "RECEIVED", amount: "50.00", debt: { currency: "EUR", amount: "30.00" } });
  assert.equal(wrongDirection.body.error.code, "SETTLEMENT_WRONG_DIRECTION");

  const paid = await settle({ personId: BETO, direction: "PAID", amount: "50.00", debt: { currency: "EUR", amount: "30.00" } });
  assert.equal(paid.status, 201);
  assert.deepEqual(await totalsByCurrency(paid.body.id), [
    { currency: "AUD", net: "0.00" },
    { currency: "EUR", net: "0.00" },
  ]);
  const clearing = await client.query(
    `SELECT a.subtype FROM "Posting" p JOIN "LedgerAccount" a ON a.id = p."ledgerAccountId"
     WHERE p."journalEntryId" = $1 AND a.kind = 'CLEARING'`,
    [paid.body.id]
  );
  assert.equal(clearing.rowCount, 2);
  assert.equal(await balanceOf(BETO, "EUR"), "0.00");
});

test("balances endpoint adds an approximate AUD net", { skip }, async () => {
  const shared = await post("/shared-expenses", {
    amount: "40.00",
    description: "Integration taxi",
    paidBy: { accountId: AUD_ACCOUNT },
    split: { mode: "EQUAL", people: [{ personId: ANA }] },
  });
  assert.equal(shared.status, 201);
  const ana = (await (await api("/people/balances")).json()).find((person) => person.id === ANA);
  assert.deepEqual(ana.balances, [{ currency: "AUD", balance: "20.00" }]);
  assert.equal(ana.netAud, "20.00");
});

test("history lists shared expenses and settlements with each person's signed effect", { skip }, async () => {
  const history = await (await api("/people/history")).json();
  const mine = history.filter((entry) => entryIds.includes(entry.id));
  const find = (description) => mine.find((entry) => entry.description === description);

  assert.deepEqual(find("Integration cena").people, [{ personId: ANA, name: "Integration Ana S", currency: "AUD", amount: "30.00" }]);
  assert.equal(find("Integration cena").kind, "SHARED_EXPENSE");
  assert.deepEqual(find("Integration hotel").people.map((item) => [item.currency, item.amount]), [["EUR", "-30.00"]]);
  const paid = find("Le pagaste a Integration Beto S");
  assert.equal(paid.kind, "PERSON_SETTLEMENT");
  assert.deepEqual(paid.people.map((item) => [item.currency, item.amount]), [["EUR", "30.00"]]);
  const received = mine.filter((entry) => entry.description === "Integration Ana S te pagó");
  assert.deepEqual(received.map((entry) => entry.people[0].amount).sort(), ["-10.00", "-20.00"]);
});
