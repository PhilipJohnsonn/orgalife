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
