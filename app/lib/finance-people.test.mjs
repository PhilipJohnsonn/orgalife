import assert from "node:assert/strict";
import test from "node:test";

import {
  PersonError,
  assertPersonArchivable,
  assertSettlementFits,
  parsePersonName,
  parsePersonSettlementCommand,
} from "./finance-people.ts";

test("normalizes person names", () => {
  assert.equal(parsePersonName("  Juan   Pérez "), "Juan Pérez");
});

test("rejects empty or too long person names", () => {
  for (const [input, code] of [["", "PERSON_NAME_REQUIRED"], ["   ", "PERSON_NAME_REQUIRED"], [null, "PERSON_NAME_REQUIRED"], ["a".repeat(61), "PERSON_NAME_TOO_LONG"]]) {
    assert.throws(
      () => parsePersonName(input),
      (error) => error instanceof PersonError && error.code === code && error.status === 422
    );
  }
});

test("blocks archiving a person with an open balance in any currency", () => {
  assert.throws(
    () => assertPersonArchivable("Juan", [
      { currency: "AUD", balance: "0.00" },
      { currency: "EUR", balance: "-20.00" },
    ]),
    (error) =>
      error instanceof PersonError &&
      error.code === "PERSON_HAS_BALANCE" &&
      error.status === 409 &&
      error.message.includes("-20.00 EUR") &&
      !error.message.includes("AUD")
  );
  assert.doesNotThrow(() => assertPersonArchivable("Juan", [{ currency: "AUD", balance: "0.00" }]));
  assert.doesNotThrow(() => assertPersonArchivable("Juan", []));
});

test("parses a settlement command, with or without a debt in another currency", () => {
  const base = {
    personId: "p",
    direction: "RECEIVED",
    accountId: "acc",
    amount: "20",
    occurredOn: "2026-09-30",
    idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
  };
  assert.deepEqual(parsePersonSettlementCommand(base), { ...base, debt: undefined, description: undefined });
  assert.deepEqual(parsePersonSettlementCommand({ ...base, debt: { currency: "eur", amount: "12.50" } }).debt, {
    currency: "EUR",
    amount: "12.50",
  });
  for (const bad of [{ direction: "LENT" }, { amount: "0" }, { idempotencyKey: "x" }, { debt: { currency: "EU", amount: "1" } }]) {
    assert.throws(
      () => parsePersonSettlementCommand({ ...base, ...bad }),
      (error) => error instanceof PersonError && error.code === "INVALID_PAYLOAD" && error.status === 400
    );
  }
});

test("settlements only move a balance toward zero", () => {
  assert.doesNotThrow(() => assertSettlementFits("Ana", "RECEIVED", "AUD", "20.00", "20"));
  assert.doesNotThrow(() => assertSettlementFits("Ana", "PAID", "EUR", "-20.00", "5"));
  const code = (fn) => {
    try {
      fn();
    } catch (error) {
      return error.code;
    }
  };
  assert.equal(code(() => assertSettlementFits("Ana", "RECEIVED", "AUD", "-5.00", "1")), "SETTLEMENT_WRONG_DIRECTION");
  assert.equal(code(() => assertSettlementFits("Ana", "PAID", "AUD", "0.00", "1")), "SETTLEMENT_WRONG_DIRECTION");
  assert.equal(code(() => assertSettlementFits("Ana", "RECEIVED", "AUD", "20.00", "20.01")), "SETTLEMENT_EXCEEDS_BALANCE");
});
