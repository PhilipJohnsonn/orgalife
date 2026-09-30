import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test, { after, before } from "node:test";

import { Client } from "pg";

// Exercises the HTTP endpoint against a running app (e.g. `npm run dev`).
// Set ORGALIFE_BASE_URL=http://localhost:3000 to run it; skipped otherwise.
const baseUrl = process.env.ORGALIFE_BASE_URL;
const connectionString = process.env.DATABASE_URL;
const skip = !baseUrl || !connectionString ? "ORGALIFE_BASE_URL and DATABASE_URL are required" : false;

const PREFIX = "quick-capture-card-integration";
const GROUP_ID = `${PREFIX}-group`;
const CARD_ID = `${PREFIX}-card`;
const SESSION_ID = `${PREFIX}-session`;
const token = randomBytes(32).toString("base64url");
let client;

before(async () => {
  if (skip) return;
  client = new Client({ connectionString });
  await client.connect();
  await client.query(
    `INSERT INTO "AccountGroup" (id, name, region, type, "updatedAt") VALUES ($1, 'Integration Visa', 'GLOBAL', 'CARD', NOW())`,
    [GROUP_ID]
  );
  await client.query(
    `INSERT INTO "LedgerAccount" (id, "accountGroupId", name, currency, kind, subtype, "updatedAt")
     VALUES ($1, $2, 'Integration Visa USD', 'USD', 'LIABILITY', 'CARD', NOW())`,
    [CARD_ID, GROUP_ID]
  );
  await client.query(
    `INSERT INTO "Session" (id, "tokenHash", "expiresAt") VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [SESSION_ID, createHash("sha256").update(token).digest("hex")]
  );
});

after(async () => {
  if (skip) return;
  const entries = `SELECT DISTINCT "journalEntryId" FROM "Posting" WHERE "ledgerAccountId" = $1`;
  const ids = (await client.query(entries, [CARD_ID])).rows.map((row) => row.journalEntryId);
  await client.query('DELETE FROM "Posting" WHERE "journalEntryId" = ANY($1)', [ids]);
  await client.query('DELETE FROM "JournalEntry" WHERE id = ANY($1)', [ids]);
  await client.query('DELETE FROM "LedgerAccount" WHERE id = $1', [CARD_ID]);
  await client.query('DELETE FROM "AccountGroup" WHERE id = $1', [GROUP_ID]);
  await client.query('DELETE FROM "Session" WHERE id = $1', [SESSION_ID]);
  await client.end();
});

test("a card purchase from quick capture is posted at once and counts on the card", { skip }, async () => {
  const response = await fetch(`${baseUrl}/api/finance/v1/quick-capture`, {
    method: "POST",
    headers: { cookie: `orgalife-session=${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: "12.50", currency: "USD", merchant: "Integration Café", accountId: CARD_ID, occurredAt: "2033-01-05" }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.status, "POSTED");

  const accounts = await (
    await fetch(`${baseUrl}/api/finance/v1/accounts`, { headers: { cookie: `orgalife-session=${token}` } })
  ).json();
  assert.equal(accounts.find((account) => account.id === CARD_ID).balance, "12.50");
});
