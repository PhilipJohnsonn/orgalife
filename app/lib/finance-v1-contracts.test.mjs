import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestValidationError,
  parseBaseCurrencyCommand,
  parseCardPaymentCommand,
  parseCreateObligationCommand,
  parseCreateAccountCommand,
  parseFxCommand,
  parseIncomeExpenseCommand,
  parseManualRateCommand,
  parseProvisionalCardPurchaseCommand,
  parseRecurringCommitmentCommand,
  parseSettleObligationCommand,
  parseTransferCommand,
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

test("accepts transfers and FX with decimal strings", () => {
  const common = {
    sourceAccountId: "source",
    destinationAccountId: "destination",
    occurredOn: "2026-08-10",
    description: "Mover fondos",
    idempotencyKey: valid.idempotencyKey,
  };

  assert.deepEqual(parseTransferCommand({ ...common, amount: "200.00" }), {
    ...common,
    amount: "200.00",
  });
  assert.deepEqual(
    parseFxCommand({ ...common, sourceAmount: "130000.00", destinationAmount: "100.00" }),
    { ...common, sourceAmount: "130000.00", destinationAmount: "100.00" }
  );
});

test("validates manual USD-pivot rates", () => {
  assert.deepEqual(
    parseManualRateCommand({ quoteCurrency: "ARS", rate: "1300.12345678", appliedOn: "2026-08-10" }),
    { quoteCurrency: "ARS", rate: "1300.12345678", appliedOn: "2026-08-10" }
  );

  for (const input of [
    { quoteCurrency: "USD", rate: "1", appliedOn: "2026-08-10" },
    { quoteCurrency: "ARS", rate: 1300, appliedOn: "2026-08-10" },
    { quoteCurrency: "ARS", rate: "0", appliedOn: "2026-08-10" },
    { quoteCurrency: "ARS", rate: "1.123456789", appliedOn: "2026-08-10" },
  ]) {
    assert.throws(() => parseManualRateCommand(input), RequestValidationError);
  }
});

test("validates configurable base currency", () => {
  assert.deepEqual(parseBaseCurrencyCommand({ baseCurrency: "AUD" }), {
    baseCurrency: "AUD",
  });
  assert.throws(
    () => parseBaseCurrencyCommand({ baseCurrency: "aud" }),
    RequestValidationError
  );
});

test("rejects invalid transfer and FX contracts", () => {
  const common = {
    sourceAccountId: "same",
    destinationAccountId: "same",
    occurredOn: "2026-08-10",
    description: "Mover fondos",
    idempotencyKey: valid.idempotencyKey,
  };

  assert.throws(() => parseTransferCommand({ ...common, amount: "1.00" }), RequestValidationError);
  assert.throws(
    () => parseFxCommand({ ...common, destinationAccountId: "other", sourceAmount: "1.00", destinationAmount: "0" }),
    RequestValidationError
  );
});

test("validates card payments and provisional card purchases", () => {
  assert.deepEqual(
    parseCardPaymentCommand({
      statementId: "statement-1",
      sourceAccountId: "bank-ars",
      amount: "105.00",
      occurredOn: "2026-08-10",
      idempotencyKey: valid.idempotencyKey,
    }),
    {
      statementId: "statement-1",
      sourceAccountId: "bank-ars",
      amount: "105.00",
      occurredOn: "2026-08-10",
      idempotencyKey: valid.idempotencyKey,
    }
  );
  assert.deepEqual(
    parseProvisionalCardPurchaseCommand({
      cardGroupId: "card-1",
      currency: "AUD",
      amount: "12.50",
      occurredOn: "2026-08-10",
      description: "Netflix",
      idempotencyKey: valid.idempotencyKey,
    }),
    {
      cardGroupId: "card-1",
      currency: "AUD",
      amount: "12.50",
      occurredOn: "2026-08-10",
      description: "Netflix",
      idempotencyKey: valid.idempotencyKey,
    }
  );
  assert.throws(
    () => parseCardPaymentCommand({ statementId: "statement-1", amount: 10 }),
    RequestValidationError
  );
  assert.throws(
    () => parseProvisionalCardPurchaseCommand({ ...valid, currency: "ars" }),
    RequestValidationError
  );
});

test("validates obligations, settlements and recurring commitments", () => {
  assert.equal(
    parseCreateObligationCommand({
      direction: "RECEIVABLE",
      originType: "ACCOUNT_MOVEMENT",
      counterparty: "Persona",
      description: "Préstamo",
      currency: "ARS",
      amount: "100.00",
      occurredOn: "2026-08-10",
      assetAccountId: "bank-1",
      idempotencyKey: valid.idempotencyKey,
    }).amount,
    "100.00"
  );
  assert.equal(
    parseSettleObligationCommand({
      obligationId: "obligation-1",
      assetAccountId: "bank-1",
      amount: "40.00",
      occurredOn: "2026-08-11",
      idempotencyKey: valid.idempotencyKey,
    }).amount,
    "40.00"
  );
  assert.deepEqual(
    parseRecurringCommitmentCommand({
      name: "Netflix",
      expectedAmount: "12.50",
      currency: "AUD",
      frequency: "MONTHLY",
      startsOn: "2026-08-01",
    }),
    {
      name: "Netflix",
      expectedAmount: "12.50",
      currency: "AUD",
      frequency: "MONTHLY",
      startsOn: "2026-08-01",
    }
  );
  assert.throws(
    () => parseCreateObligationCommand({ direction: "RECEIVABLE", originType: "ACCOUNT_MOVEMENT" }),
    RequestValidationError
  );
  assert.throws(
    () => parseRecurringCommitmentCommand({ name: "Once", expectedAmount: "1", currency: "USD", frequency: "ONCE", startsOn: "2026-08-10", endsOn: "2026-08-01" }),
    RequestValidationError
  );
});
