import assert from "node:assert/strict";
import test from "node:test";

import { createSessionToken } from "./auth.ts";

test("does not create a session token with incomplete configuration", () => {
  assert.equal(createSessionToken(undefined, "secret"), null);
  assert.equal(createSessionToken("password", undefined), null);
  assert.equal(createSessionToken("", ""), null);
});

test("creates a stable token when password and secret are configured", () => {
  const first = createSessionToken("password", "secret");
  const second = createSessionToken("password", "secret");

  assert.equal(first, second);
  assert.match(first ?? "", /^[a-f0-9]{64}$/);
});
