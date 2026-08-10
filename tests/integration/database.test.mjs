import assert from "node:assert/strict";
import test, { after } from "node:test";

import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const client = new Client({ connectionString });

await client.connect();

after(async () => {
  await client.end();
});

test("connects to the migrated PostgreSQL database", async () => {
  const result = await client.query("SELECT 1::int AS value");

  assert.equal(result.rows[0]?.value, 1);
});

test("contains both non-financial and current financial tables", async () => {
  const result = await client.query(`
    SELECT
      to_regclass('"Board"')::text AS board,
      to_regclass('"Transaction"')::text AS finance,
      to_regclass('"Session"')::text AS session
  `);

  assert.equal(result.rows[0]?.board, '"Board"');
  assert.equal(result.rows[0]?.finance, '"Transaction"');
  assert.equal(result.rows[0]?.session, '"Session"');
});

test("stores only a unique session token hash and supports revocation", async () => {
  const tokenHash = "a".repeat(64);

  await client.query('DELETE FROM "Session" WHERE "tokenHash" = $1', [tokenHash]);
  await client.query(
    `INSERT INTO "Session" (id, "tokenHash", "expiresAt")
     VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
    ["session-integration-test", tokenHash]
  );

  const inserted = await client.query(
    'SELECT "tokenHash", "revokedAt" FROM "Session" WHERE id = $1',
    ["session-integration-test"]
  );
  assert.equal(inserted.rows[0]?.tokenHash, tokenHash);
  assert.equal(inserted.rows[0]?.revokedAt, null);

  await client.query(
    'UPDATE "Session" SET "revokedAt" = NOW() WHERE id = $1',
    ["session-integration-test"]
  );
  const revoked = await client.query(
    'SELECT "revokedAt" IS NOT NULL AS revoked FROM "Session" WHERE id = $1',
    ["session-integration-test"]
  );
  assert.equal(revoked.rows[0]?.revoked, true);

  await client.query('DELETE FROM "Session" WHERE id = $1', [
    "session-integration-test",
  ]);
});

test("contains the additive ledger foundation without replacing legacy finance", async () => {
  const result = await client.query(`
    SELECT
      to_regclass('"AccountGroup"')::text AS account_group,
      to_regclass('"LedgerAccount"')::text AS ledger_account,
      to_regclass('"JournalEntry"')::text AS journal_entry,
      to_regclass('"Posting"')::text AS posting,
      to_regclass('"JournalEntryAudit"')::text AS audit,
      to_regclass('"ExchangeRateSnapshot"')::text AS exchange_rate,
      to_regclass('"JournalEntryExchangeRateReference"')::text AS exchange_rate_reference,
      to_regclass('"FinanceConfiguration"')::text AS finance_configuration,
      to_regclass('"Transaction"')::text AS legacy_transaction
  `);

  assert.equal(result.rows[0]?.account_group, '"AccountGroup"');
  assert.equal(result.rows[0]?.ledger_account, '"LedgerAccount"');
  assert.equal(result.rows[0]?.journal_entry, '"JournalEntry"');
  assert.equal(result.rows[0]?.posting, '"Posting"');
  assert.equal(result.rows[0]?.audit, '"JournalEntryAudit"');
  assert.equal(result.rows[0]?.exchange_rate, '"ExchangeRateSnapshot"');
  assert.equal(
    result.rows[0]?.exchange_rate_reference,
    '"JournalEntryExchangeRateReference"'
  );
  assert.equal(result.rows[0]?.finance_configuration, '"FinanceConfiguration"');
  assert.equal(result.rows[0]?.legacy_transaction, '"Transaction"');
});

test("stores FX rates with eight decimal places and civil application dates", async () => {
  const result = await client.query(`
    SELECT
      (SELECT data_type
       FROM information_schema.columns
       WHERE table_name = 'ExchangeRateSnapshot' AND column_name = 'appliedOn') AS applied_on_type,
      (SELECT numeric_precision
       FROM information_schema.columns
       WHERE table_name = 'ExchangeRateSnapshot' AND column_name = 'rate') AS rate_precision,
      (SELECT numeric_scale
       FROM information_schema.columns
       WHERE table_name = 'ExchangeRateSnapshot' AND column_name = 'rate') AS rate_scale
  `);

  assert.equal(result.rows[0]?.applied_on_type, "date");
  assert.equal(result.rows[0]?.rate_precision, 18);
  assert.equal(result.rows[0]?.rate_scale, 8);
});

test("uses civil dates and fixed-scale decimal amounts", async () => {
  const result = await client.query(`
    SELECT
      (SELECT data_type
       FROM information_schema.columns
       WHERE table_name = 'JournalEntry' AND column_name = 'occurredOn') AS occurred_on_type,
      (SELECT data_type
       FROM information_schema.columns
       WHERE table_name = 'Posting' AND column_name = 'amount') AS amount_type,
      (SELECT numeric_precision
       FROM information_schema.columns
       WHERE table_name = 'Posting' AND column_name = 'amount') AS amount_precision,
      (SELECT numeric_scale
       FROM information_schema.columns
       WHERE table_name = 'Posting' AND column_name = 'amount') AS amount_scale
  `);

  assert.equal(result.rows[0]?.occurred_on_type, "date");
  assert.equal(result.rows[0]?.amount_type, "numeric");
  assert.equal(result.rows[0]?.amount_precision, 18);
  assert.equal(result.rows[0]?.amount_scale, 2);
});

test("enforces ledger structural constraints", async () => {
  await client.query(`
    INSERT INTO "AccountGroup" (id, name, region, type, "updatedAt")
    VALUES ('ledger-test-group', 'ICBC Test', 'ARGENTINA', 'BANK', NOW())
  `);
  await client.query(`
    INSERT INTO "LedgerAccount" (
      id, "accountGroupId", name, currency, kind, subtype, "updatedAt"
    ) VALUES (
      'ledger-test-account', 'ledger-test-group', 'ICBC ARS Test', 'ARS',
      'ASSET', 'BANK', NOW()
    )
  `);
  await client.query(`
    INSERT INTO "JournalEntry" (
      id, "operationType", source, "occurredOn", description, "updatedAt"
    ) VALUES (
      'ledger-test-entry', 'INCOME', 'MANUAL', DATE '2026-08-10',
      'Integration test', NOW()
    )
  `);

  await assert.rejects(
    client.query(`
      INSERT INTO "Posting" (
        id, "journalEntryId", "ledgerAccountId", side, amount
      ) VALUES (
        'ledger-test-invalid-posting', 'ledger-test-entry',
        'ledger-test-account', 'DEBIT', 0
      )
    `),
    /Posting_amount_positive_check/
  );

  await client.query('DELETE FROM "JournalEntry" WHERE id = $1', [
    "ledger-test-entry",
  ]);
  await client.query('DELETE FROM "LedgerAccount" WHERE id = $1', [
    "ledger-test-account",
  ]);
  await client.query('DELETE FROM "AccountGroup" WHERE id = $1', [
    "ledger-test-group",
  ]);
});
