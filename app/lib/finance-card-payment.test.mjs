import assert from "node:assert/strict";
import test from "node:test";

import {
  CardPaymentError,
  cardDebtAtClosing,
  nextClosingOn,
  parseCardPaymentCommand,
  statementDifference,
} from "./finance-card-payment.ts";

const valid = {
  cardGroupId: "card-1",
  occurredOn: "2026-10-05",
  closingOn: "2026-09-25",
  payments: [
    { currency: "usd", sourceAccountId: "bank-usd", amount: "1010.00" },
    { currency: "ARS", sourceAccountId: "bank-ars", amount: "52000" },
  ],
  idempotencyKey: "3d594650-3436-4b4f-b22c-6db68a92a75d",
};

test("parses a card payment with one amount per currency", () => {
  assert.deepEqual(parseCardPaymentCommand(valid), {
    ...valid,
    payments: [
      { currency: "USD", sourceAccountId: "bank-usd", amount: "1010.00" },
      { currency: "ARS", sourceAccountId: "bank-ars", amount: "52000" },
    ],
  });
  const partial = parseCardPaymentCommand({ ...valid, closingOn: undefined });
  assert.equal(partial.closingOn, undefined);
});

test("rejects invalid card payments", () => {
  const rejects = (body) => assert.throws(() => parseCardPaymentCommand(body), CardPaymentError);
  rejects({ ...valid, payments: [] });
  rejects({ ...valid, payments: [{ ...valid.payments[0], amount: "0" }] });
  rejects({ ...valid, payments: [valid.payments[0], { ...valid.payments[0], sourceAccountId: "other" }] });
  rejects({ ...valid, closingOn: "2026-10-06" });
  rejects({ ...valid, idempotencyKey: "nope" });
});

test("debt at closing counts charges up to the closing date and every settlement", () => {
  const postings = [
    { side: "CREDIT", amount: "600.00", occurredOn: "2026-09-02", settlement: false },
    { side: "CREDIT", amount: "400.00", occurredOn: "2026-09-25", settlement: false },
    // Next statement: not part of this one.
    { side: "CREDIT", amount: "75.00", occurredOn: "2026-09-26", settlement: false },
    // A partial payment after the closing still reduces what is owed.
    { side: "DEBIT", amount: "100.00", occurredOn: "2026-10-01", settlement: true },
    // A refund before the closing.
    { side: "DEBIT", amount: "20.00", occurredOn: "2026-09-10", settlement: false },
  ];
  assert.equal(cardDebtAtClosing(postings, "2026-09-25"), "880.00");
});

test("statement difference is what was paid minus what was recorded", () => {
  assert.equal(statementDifference("890.50", "880.00"), "10.50");
  assert.equal(statementDifference("875.00", "880.00"), "-5.00");
  assert.equal(statementDifference("880", "880.00"), "0.00");
});

test("suggests the next closing one month after the last one", () => {
  assert.equal(nextClosingOn("2026-09-25"), "2026-10-25");
  assert.equal(nextClosingOn("2026-01-31"), "2026-02-28");
  assert.equal(nextClosingOn("2026-12-15"), "2027-01-15");
});
