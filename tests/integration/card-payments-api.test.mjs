import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import { Client } from "pg";

// Exercises the HTTP endpoint against a running app (e.g. `npm run dev`).
// Set ORGALIFE_BASE_URL=http://localhost:3000 to run it; skipped otherwise.
const baseUrl = process.env.ORGALIFE_BASE_URL;
const connectionString = process.env.DATABASE_URL;
const skip = !baseUrl || !connectionString ? "ORGALIFE_BASE_URL and DATABASE_URL are required" : false;

const PREFIX = "card-payment-integration";
const GROUP_ID = `${PREFIX}-group`;
const CARD_USD = `${PREFIX}-card-usd`;
const CARD_ARS = `${PREFIX}-card-ars`;
const BANK_USD = `${PREFIX}-bank-usd`;
const BANK_ARS = `${PREFIX}-bank-ars`;
const ACCOUNT_IDS = [CARD_USD, CARD_ARS, BANK_USD, BANK_ARS];
const SESSION_ID = `${PREFIX}-session`;
const CATEGORY = "Tarjeta: cambio y cargos";
const token = randomBytes(32).toString("base64url");
let client;
let categoryExisted = false;

function api(path, init = {}) {
  return fetch(`${baseUrl}/api/finance/v1${path}`, {
    ...init,
    headers: { ...init.headers, cookie: `orgalife-session=${token}`, "Content-Type": "application/json" },
  });
}

async function capture(accountId, amount, currency, occurredAt) {
  const response = await api("/quick-capture", {
    method: "POST",
    body: JSON.stringify({ amount, currency, merchant: "Integration compra", accountId, occurredAt }),
  });
  assert.equal(response.status, 201);
}

async function pay(body) {
  const response = await api("/card-payments", {
    method: "POST",
    body: JSON.stringify({ cardGroupId: GROUP_ID, occurredOn: "2033-04-05", idempotencyKey: randomUUID(), ...body }),
  });
  return { status: response.status, body: await response.json() };
}

async function balances() {
  const accounts = await (await api("/accounts")).json();
  return Object.fromEntries(
    accounts.filter((account) => ACCOUNT_IDS.includes(account.id)).map((account) => [account.id, account.balance])
  );
}

async function debts(closingOn) {
  const body = await (await api(`/card-payments?cardGroupId=${GROUP_ID}&closingOn=${closingOn}`)).json();
  return Object.fromEntries(body.currencies.map((item) => [item.currency, item.debtAtClosing]));
}

before(async () => {
  if (skip) return;
  client = new Client({ connectionString });
  await client.connect();
  categoryExisted = (await client.query(`SELECT 1 FROM "Category" WHERE name = $1`, [CATEGORY])).rowCount > 0;
  await client.query(
    `INSERT INTO "AccountGroup" (id, name, region, type, "updatedAt") VALUES ($1, 'Integration Visa P', 'GLOBAL', 'CARD', NOW())`,
    [GROUP_ID]
  );
  await client.query(
    `INSERT INTO "LedgerAccount" (id, "accountGroupId", name, currency, kind, subtype, "updatedAt") VALUES
       ($1, $5, 'Integration Visa P USD', 'USD', 'LIABILITY', 'CARD', NOW()),
       ($2, $5, 'Integration Visa P ARS', 'ARS', 'LIABILITY', 'CARD', NOW()),
       ($3, NULL, 'Integration banco USD', 'USD', 'ASSET', 'BANK', NOW()),
       ($4, NULL, 'Integration banco ARS', 'ARS', 'ASSET', 'BANK', NOW())`,
    [CARD_USD, CARD_ARS, BANK_USD, BANK_ARS, GROUP_ID]
  );
  await client.query(
    `INSERT INTO "Session" (id, "tokenHash", "expiresAt") VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [SESSION_ID, createHash("sha256").update(token).digest("hex")]
  );

  await capture(CARD_USD, "600.00", "USD", "2033-03-02");
  await capture(CARD_USD, "400.00", "USD", "2033-03-25");
  await capture(CARD_USD, "75.00", "USD", "2033-03-27");
  await capture(CARD_ARS, "50000.00", "ARS", "2033-03-10");
});

after(async () => {
  if (skip) return;
  const entries = `SELECT DISTINCT "journalEntryId" FROM "Posting" WHERE "ledgerAccountId" = ANY($1)`;
  const ids = (await client.query(entries, [ACCOUNT_IDS])).rows.map((row) => row.journalEntryId);
  await client.query('DELETE FROM "Posting" WHERE "journalEntryId" = ANY($1)', [ids]);
  await client.query('DELETE FROM "JournalEntry" WHERE id = ANY($1)', [ids]);
  await client.query('DELETE FROM "LedgerAccount" WHERE id = ANY($1)', [ACCOUNT_IDS]);
  await client.query('DELETE FROM "AccountGroup" WHERE id = $1', [GROUP_ID]);
  await client.query('DELETE FROM "Session" WHERE id = $1', [SESSION_ID]);
  if (!categoryExisted) await client.query('DELETE FROM "Category" WHERE name = $1', [CATEGORY]);
  await client.end();
});

test("debt at closing only counts charges up to the closing date", { skip }, async () => {
  assert.deepEqual(await debts("2033-03-25"), { ARS: "50000.00", USD: "1000.00" });
  const firstTime = await (await api(`/card-payments?cardGroupId=${GROUP_ID}`)).json();
  assert.equal(firstTime.closingOn, null, "no suggestion before the first full payment");
});

test("paying the whole statement books the difference and leaves only later charges", { skip }, async () => {
  const before = await (await api("/monthly-summary?month=2033-04")).json();
  const idempotencyKey = randomUUID();
  const paid = await pay({
    closingOn: "2033-03-25",
    idempotencyKey,
    payments: [
      { currency: "USD", sourceAccountId: BANK_USD, amount: "1010.50" },
      { currency: "ARS", sourceAccountId: BANK_ARS, amount: "49000" },
    ],
  });
  assert.equal(paid.status, 201);
  assert.deepEqual(
    paid.body.payments.map((item) => [item.currency, item.debtAtClosing, item.difference]),
    [["USD", "1000.00", "10.50"], ["ARS", "50000.00", "-1000.00"]]
  );

  assert.deepEqual(await balances(), {
    [CARD_USD]: "75.00",
    [CARD_ARS]: "0.00",
    [BANK_USD]: "-1010.50",
    [BANK_ARS]: "-49000.00",
  });

  const replay = await pay({
    closingOn: "2033-03-25",
    idempotencyKey,
    payments: [{ currency: "USD", sourceAccountId: BANK_USD, amount: "1010.50" }],
  });
  assert.equal(replay.status, 200);
  assert.equal((await balances())[CARD_USD], "75.00");

  const after = await (await api("/monthly-summary?month=2033-04")).json();
  assert.deepEqual(before.current.native.expenses, []);
  assert.deepEqual(after.current.native.expenses, [
    { currency: "ARS", amount: "-1000.00" },
    { currency: "USD", amount: "10.50" },
  ]);
  assert.ok(after.categories.some((category) => category.name === CATEGORY));

  // Cierre's month flow counts card purchases and statement differences like Mes does.
  const flow = async (from, to) =>
    (await (await api(`/overview?region=GLOBAL&from=${from}&to=${to}`)).json()).native.flow;
  assert.deepEqual(await flow("2033-03-01", "2033-03-31"), [
    { currency: "ARS", amount: "-50000.00" },
    { currency: "USD", amount: "-1075.00" },
  ]);
  assert.deepEqual(await flow("2033-04-01", "2033-04-30"), [
    { currency: "ARS", amount: "1000.00" },
    { currency: "USD", amount: "-10.50" },
  ]);

  const movements = await (await api("/monthly-movements?month=2033-04")).json();
  const mine = movements.filter((movement) => movement.description.includes("Integration Visa P"));
  assert.deepEqual(
    mine.map((movement) => [movement.description, movement.kind, movement.currency, movement.amount, movement.splittable]).sort(),
    [
      ["Diferencia resumen Integration Visa P", "EXPENSE", "USD", "10.50", false],
      ["Diferencia resumen Integration Visa P", "INCOME", "ARS", "1000.00", false],
      ["Pago Integration Visa P", "TRANSFER", "ARS", "49000.00", false],
      ["Pago Integration Visa P", "TRANSFER", "USD", "1010.50", false],
    ]
  );
});

test("the next statement starts from what the previous payment left", { skip }, async () => {
  assert.deepEqual(await debts("2033-04-25"), { ARS: "0.00", USD: "75.00" });
  const suggested = await (await api(`/card-payments?cardGroupId=${GROUP_ID}`)).json();
  assert.equal(suggested.closingOn, "2033-04-25", "one month after the last recorded closing");
  assert.deepEqual(suggested.currencies, [
    { currency: "ARS", debtAtClosing: "0.00" },
    { currency: "USD", debtAtClosing: "75.00" },
  ]);
});

test("a partial payment without closing date books no difference", { skip }, async () => {
  const paid = await pay({ payments: [{ currency: "USD", sourceAccountId: BANK_USD, amount: "20" }] });
  assert.equal(paid.status, 201);
  assert.equal(paid.body.payments[0].difference, null);
  assert.equal((await balances())[CARD_USD], "55.00");
});

test("rejects a payment from another currency or after-the-fact closing", { skip }, async () => {
  const mismatch = await pay({ payments: [{ currency: "USD", sourceAccountId: BANK_ARS, amount: "10" }] });
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.body.error.code, "SOURCE_CURRENCY_MISMATCH");

  const closingAfter = await pay({
    closingOn: "2033-04-06",
    payments: [{ currency: "USD", sourceAccountId: BANK_USD, amount: "10" }],
  });
  assert.equal(closingAfter.status, 400);
  assert.equal((await balances())[CARD_USD], "55.00");
});
