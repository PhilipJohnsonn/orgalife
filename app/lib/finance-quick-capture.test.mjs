import assert from "node:assert/strict";
import test from "node:test";

import {
  parseQuickCaptureCommand,
  parseWalletAmount,
} from "./finance-v1-contracts.ts";

test("parses Wallet and Shortcuts amount formats", () => {
  assert.deepEqual(parseWalletAmount("A$12.50"), { amount: "12.50", currency: "AUD" });
  assert.deepEqual(parseWalletAmount("-A$12.50"), { amount: "12.50", currency: "AUD" });
  assert.deepEqual(parseWalletAmount("US$3"), { amount: "3.00", currency: "USD" });
  assert.deepEqual(parseWalletAmount("$1,234.50"), { amount: "1234.50", currency: null });
  assert.deepEqual(parseWalletAmount("1.234,50"), { amount: "1234.50", currency: null });
  assert.deepEqual(parseWalletAmount("12,50"), { amount: "12.50", currency: null });
  assert.deepEqual(parseWalletAmount("1,234"), { amount: "1234.00", currency: null });
  assert.deepEqual(parseWalletAmount("12.50 AUD"), { amount: "12.50", currency: "AUD" });
  assert.deepEqual(parseWalletAmount(7.5), { amount: "7.50", currency: null });
});

test("rejects empty, zero and malformed amounts", () => {
  for (const value of ["", "A$0", "abc", "12.345", null, undefined]) {
    assert.throws(() => parseWalletAmount(value), { code: "INVALID_PAYLOAD" });
  }
});

const base = {
  amount: "A$12.50",
  merchant: "Woolworths",
  card: "Revolut",
  occurredAt: "2026-09-23T10:15",
};

test("builds an expense command with detected currency and civil date", () => {
  const command = parseQuickCaptureCommand(base);
  assert.equal(command.kind, "EXPENSE");
  assert.equal(command.amount, "12.50");
  assert.equal(command.currency, "AUD");
  assert.equal(command.occurredOn, "2026-09-23");
  assert.equal(command.categoryId, null);
  assert.match(command.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("explicit currency wins over the detected one", () => {
  assert.equal(parseQuickCaptureCommand({ ...base, currency: "usd" }).currency, "USD");
});

test("retries in the same minute share an idempotency key", () => {
  const first = parseQuickCaptureCommand(base);
  const retry = parseQuickCaptureCommand({ ...base, occurredAt: "2026-09-23T10:15:42" });
  const later = parseQuickCaptureCommand({ ...base, occurredAt: "2026-09-23T10:16" });
  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  assert.notEqual(first.idempotencyKey, later.idempotencyKey);
});

test("requires merchant, a card or account, and a valid occurredAt", () => {
  assert.throws(() => parseQuickCaptureCommand({ ...base, merchant: " " }), { code: "INVALID_PAYLOAD" });
  assert.throws(() => parseQuickCaptureCommand({ ...base, card: undefined }), { code: "INVALID_PAYLOAD" });
  assert.throws(() => parseQuickCaptureCommand({ ...base, occurredAt: "23/09/2026" }), { code: "INVALID_PAYLOAD" });
  assert.throws(() => parseQuickCaptureCommand({ ...base, kind: "TRANSFER" }), { code: "INVALID_PAYLOAD" });
  assert.equal(parseQuickCaptureCommand({ ...base, card: undefined, accountId: "acc_1" }).accountId, "acc_1");
});

test("accepts a category by name for Shortcuts menus", () => {
  assert.equal(parseQuickCaptureCommand({ ...base, categoryName: "Transporte" }).categoryName, "Transporte");
  assert.equal(parseQuickCaptureCommand(base).categoryName, null);
});
