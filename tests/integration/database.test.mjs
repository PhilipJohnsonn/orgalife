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
      to_regclass('"Transaction"')::text AS finance
  `);

  assert.equal(result.rows[0]?.board, '"Board"');
  assert.equal(result.rows[0]?.finance, '"Transaction"');
});
