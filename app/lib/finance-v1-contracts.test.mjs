import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestValidationError,
  parseCreateAccountCommand,
  parseIncomeExpenseCommand,
} from "./finance-v1-contracts.ts";

const valid = {
  type: "INCOME",
  accountId: "account-1",
  amount: "123.45",
  occurredOn: "2026-08-10",
  description: "Sueldo",
  idempotencyKey: "3d594650-3436-4b4f-b22c-6db68a92a75d",
};

test("accepts the finance v1 income/expense contract", () => {
  assert.deepEqual(parseIncomeExpenseCommand(valid), valid);
  assert.equal(
    parseIncomeExpenseCommand({ ...valid, type: "EXPENSE", categoryId: "food" }).categoryId,
    "food"
  );
});

test("validates account onboarding without numeric JSON money", () => {
  const account = parseCreateAccountCommand({
    groupName: "ICBC",
    region: "ARGENTINA",
    groupType: "BANK",
    accountName: "ICBC ARS",
    currency: "ARS",
    trackingMode: "TRANSACTIONAL",
    openingBalance: "1000.00",
    openingOn: "2026-08-10",
  });
  assert.equal(account.openingBalance, "1000.00");

  assert.throws(
    () => parseCreateAccountCommand({ ...account, openingBalance: 1000 }),
    (error) => error instanceof RequestValidationError
  );
});

test("rejects malformed finance v1 commands", () => {
  for (const input of [
    null,
    [],
    { ...valid, type: "TRANSFER" },
    { ...valid, amount: 10 },
    { ...valid, amount: "0" },
    { ...valid, amount: "1.001" },
    { ...valid, occurredOn: "10/08/2026" },
    { ...valid, description: " " },
    { ...valid, idempotencyKey: "not-a-uuid" },
  ]) {
    assert.throws(
      () => parseIncomeExpenseCommand(input),
      (error) => error instanceof RequestValidationError
    );
  }
});
