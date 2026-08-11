import assert from "node:assert/strict";
import test from "node:test";

import {
  bearerMatches,
  createOpaqueSessionToken,
  hashSessionToken,
  isMcpPathAllowed,
  mcpBearerDecision,
  passwordMatches,
  sessionIsActive,
} from "./auth.ts";

test("creates high-entropy opaque session tokens and stable hashes", () => {
  const first = createOpaqueSessionToken();
  const second = createOpaqueSessionToken();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hashSessionToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
});

test("password authentication fails closed without configuration", () => {
  assert.equal(passwordMatches("password", undefined), false);
  assert.equal(passwordMatches("password", ""), false);
  assert.equal(passwordMatches(undefined, "password"), false);
  assert.equal(passwordMatches("wrong", "password"), false);
  assert.equal(passwordMatches("password", "password"), true);
});

test("sessions reject expiry and revocation", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");

  assert.equal(sessionIsActive(null, now), false);
  assert.equal(
    sessionIsActive(
      { expiresAt: new Date("2026-08-10T00:00:01.000Z"), revokedAt: null },
      now
    ),
    true
  );
  assert.equal(
    sessionIsActive(
      { expiresAt: now, revokedAt: null },
      now
    ),
    false
  );
  assert.equal(
    sessionIsActive(
      { expiresAt: new Date("2026-08-10T00:00:01.000Z"), revokedAt: now },
      now
    ),
    false
  );
});

test("MCP bearer is valid only with configured matching secret", () => {
  assert.equal(bearerMatches("Bearer secret", undefined), false);
  assert.equal(bearerMatches("Bearer wrong", "secret"), false);
  assert.equal(bearerMatches("Basic secret", "secret"), false);
  assert.equal(bearerMatches("Bearer secret", "secret"), true);
});

test("MCP bearer allowlist is default-deny", () => {
  for (const pathname of [
    "/api/boards",
    "/api/boards/board-1",
    "/api/columns/column-1/reorder",
    "/api/tasks/task-1/subtasks",
    "/api/subtasks/subtask-1",
    "/api/tags/tag-1",
  ]) {
    assert.equal(isMcpPathAllowed(pathname), true, pathname);
  }

  for (const pathname of [
    "/",
    "/tasks",
    "/api/auth",
    "/api/finance/transactions",
    "/api/task",
    "/api/tasks-malicious",
  ]) {
    assert.equal(isMcpPathAllowed(pathname), false, pathname);
  }
});

test("valid MCP bearer is forbidden outside its allowlist", () => {
  assert.equal(
    mcpBearerDecision(
      "Bearer secret",
      "secret",
      "/api/finance/transactions"
    ),
    "forbid"
  );
  assert.equal(
    mcpBearerDecision("Bearer secret", "secret", "/api/tasks"),
    "allow"
  );
  assert.equal(
    mcpBearerDecision("Bearer wrong", "secret", "/api/tasks"),
    null
  );
});
