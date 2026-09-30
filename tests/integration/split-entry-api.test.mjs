import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { Client } from "pg";

// Exercises the HTTP endpoint against a running app (e.g. `npm run dev`).
// Set ORGALIFE_BASE_URL=http://localhost:3000 to run it; skipped otherwise.
const baseUrl = process.env.ORGALIFE_BASE_URL;
const connectionString = process.env.DATABASE_URL;
const skip = !baseUrl || !connectionString ? "ORGALIFE_BASE_URL and DATABASE_URL are required" : false;

const PREFIX = "split-entry-integration";
const ANA = `${PREFIX}-ana`;
const BETO = `${PREFIX}-beto`;
const AUD_ACCOUNT = `${PREFIX}-aud`;
const CARD_GROUP = `${PREFIX}-card-group`;
const CARD = `${PREFIX}-card`;
const SESSION_ID = `${PREFIX}-session`;
const token = randomBytes(32).toString("base64url");
let client;

function api(path, init = {}) {
  return fetch(`${baseUrl}/api/finance/v1${path}`, {
    ...init,
    headers: { ...init.headers, cookie: `orgalife-session=${token}`, "Content-Type": "application/json" },
  });
}

async function post(path, body) {
  const response = await api(path, { method: "POST", body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

const equalSplit = (...people) => ({ mode: "EQUAL", people: people.map((personId) => ({ personId })) });

async function balanceOf(personId, currency) {
  const person = (await (await api("/people")).json()).find((item) => item.id === personId);
  return person.balances.find((item) => item.currency === currency)?.balance ?? "0.00";
}

async function accountBalance(id) {
  return (await (await api("/accounts")).json()).find((account) => account.id === id).balance;
}

async function movementsIn(month) {
  return (await api(`/monthly-movements?month=${month}`)).json();
}

async function expensesIn(month) {
  return (await (await api(`/monthly-summary?month=${month}`)).json()).current.native.expenses;
}

before(async () => {
  if (skip) return;
  client = new Client({ connectionString });
  await client.connect();
  await client.query(
    `INSERT INTO "Person" (id, name, "updatedAt") VALUES ($1, 'Integration Ana D', NOW()), ($2, 'Integration Beto D', NOW())`,
    [ANA, BETO]
  );
  await client.query(
    `INSERT INTO "AccountGroup" (id, name, region, type, "updatedAt") VALUES ($1, 'Integration Visa D', 'GLOBAL', 'CARD', NOW())`,
    [CARD_GROUP]
  );
  await client.query(
    `INSERT INTO "LedgerAccount" (id, "accountGroupId", name, currency, kind, subtype, "updatedAt") VALUES
     ($1, NULL, 'Integration split AUD', 'AUD', 'ASSET', 'BANK', NOW()),
     ($2, $3, 'Integration Visa D USD', 'USD', 'LIABILITY', 'CARD', NOW())`,
    [AUD_ACCOUNT, CARD, CARD_GROUP]
  );
  await client.query(
    `INSERT INTO "Session" (id, "tokenHash", "expiresAt") VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [SESSION_ID, createHash("sha256").update(token).digest("hex")]
  );
});

after(async () => {
  if (skip) return;
  const accounts = (
    await client.query('SELECT id FROM "LedgerAccount" WHERE id = ANY($1) OR "personId" = ANY($2)', [
      [AUD_ACCOUNT, CARD],
      [ANA, BETO],
    ])
  ).rows.map((row) => row.id);
  const entries = (
    await client.query('SELECT DISTINCT "journalEntryId" AS id FROM "Posting" WHERE "ledgerAccountId" = ANY($1)', [accounts])
  ).rows.map((row) => row.id);
  await client.query('DELETE FROM "Posting" WHERE "journalEntryId" = ANY($1)', [entries]);
  // Reversals point at their originals: drop them first.
  await client.query('DELETE FROM "JournalEntry" WHERE id = ANY($1) AND "reversalOfId" IS NOT NULL', [entries]);
  await client.query('DELETE FROM "JournalEntry" WHERE id = ANY($1)', [entries]);
  await client.query('DELETE FROM "LedgerAccount" WHERE id = ANY($1)', [accounts]);
  await client.query('DELETE FROM "AccountGroup" WHERE id = $1', [CARD_GROUP]);
  await client.query('DELETE FROM "Person" WHERE id = ANY($1)', [[ANA, BETO]]);
  await client.query('DELETE FROM "Session" WHERE id = $1', [SESSION_ID]);
  await client.end();
});

test("a shared expense can be paid with a card", { skip }, async () => {
  const created = await post("/shared-expenses", {
    amount: "40.00",
    occurredOn: "2034-01-10",
    description: "Integration card dinner",
    idempotencyKey: randomUUID(),
    paidBy: { accountId: CARD },
    split: equalSplit(ANA),
  });
  assert.equal(created.status, 201);
  assert.equal(await accountBalance(CARD), "40.00");
  assert.equal(await balanceOf(ANA, "USD"), "20.00");
  assert.deepEqual(await expensesIn("2034-01"), [{ currency: "USD", amount: "20.00" }]);
});

test("splitting a captured expense reverses it and counts only your part", { skip }, async () => {
  const expense = await post("/transactions", {
    type: "EXPENSE",
    accountId: AUD_ACCOUNT,
    amount: "90.00",
    occurredOn: "2034-02-15",
    description: "Integration súper",
    idempotencyKey: randomUUID(),
  });
  assert.equal(expense.status, 201);
  assert.deepEqual(await expensesIn("2034-02"), [{ currency: "AUD", amount: "90.00" }]);
  const [captured] = await movementsIn("2034-02");
  assert.equal(captured.splittable, true);
  assert.equal(captured.shared, null);

  const split = await post(`/entries/${expense.body.id}/split`, { split: equalSplit(ANA, BETO) });
  assert.equal(split.status, 201);
  assert.equal(split.body.metadata.splitOf, expense.body.id);
  assert.equal(split.body.occurredOn, "2034-02-15");

  const original = await client.query('SELECT status FROM "JournalEntry" WHERE id = $1', [expense.body.id]);
  assert.equal(original.rows[0].status, "REVERSED");
  const reversal = await client.query('SELECT 1 FROM "JournalEntry" WHERE "reversalOfId" = $1', [expense.body.id]);
  assert.equal(reversal.rowCount, 1);

  assert.deepEqual(await expensesIn("2034-02"), [{ currency: "AUD", amount: "30.00" }]);
  assert.equal(await balanceOf(ANA, "AUD"), "30.00");
  assert.equal(await balanceOf(BETO, "AUD"), "30.00");
  const movements = await movementsIn("2034-02");
  assert.equal(movements.length, 1, "the reversed original leaves Movimientos");
  assert.equal(movements[0].id, split.body.id);
  assert.equal(movements[0].kind, "EXPENSE");
  assert.equal(movements[0].amount, "30.00");
  assert.deepEqual(movements[0].shared, { total: "90.00", myShare: "30.00" });
  assert.equal(movements[0].splittable, false);

  const again = await post(`/entries/${expense.body.id}/split`, { split: equalSplit(ANA) });
  assert.equal(again.body.id, split.body.id, "splitting twice returns the first split");
  assert.equal(await balanceOf(BETO, "AUD"), "30.00");

  const splitShared = await post(`/entries/${split.body.id}/split`, { split: equalSplit(ANA) });
  assert.equal(splitShared.status, 422);
  assert.equal(splitShared.body.error.code, "ENTRY_NOT_SPLITTABLE");
});

test("a card purchase captured with the + can be split", { skip }, async () => {
  const captured = await post("/quick-capture", {
    amount: "12.00",
    currency: "USD",
    merchant: "Integration taxi",
    accountId: CARD,
    occurredAt: "2034-03-03",
  });
  assert.equal(captured.status, 201);
  const cardBefore = await accountBalance(CARD);

  const split = await post(`/entries/${captured.body.id}/split`, { split: equalSplit(BETO) });
  assert.equal(split.status, 201);
  assert.equal(await accountBalance(CARD), cardBefore, "the card still owes the full purchase");
  assert.equal(await balanceOf(BETO, "USD"), "6.00");
  assert.deepEqual(await expensesIn("2034-03"), [{ currency: "USD", amount: "6.00" }]);
});
