import assert from "node:assert/strict";
import test from "node:test";

import {
  LedgerInvariantError,
  oppositePostingSide,
  parseCivilDate,
  validateBalancedPostings,
} from "./ledger.ts";

const balancedCases = [
  ["income", [["ASSET", "DEBIT"], ["INCOME", "CREDIT"]]],
  ["expense", [["EXPENSE", "DEBIT"], ["ASSET", "CREDIT"]]],
  ["transfer", [["ASSET_TO", "DEBIT"], ["ASSET_FROM", "CREDIT"]]],
  ["card purchase", [["EXPENSE", "DEBIT"], ["CARD", "CREDIT"]]],
  ["card payment", [["CARD", "DEBIT"], ["ASSET", "CREDIT"]]],
  ["opening", [["ASSET", "DEBIT"], ["EQUITY", "CREDIT"]]],
  ["adjustment", [["ASSET", "DEBIT"], ["EQUITY", "CREDIT"]]],
  ["loan", [["RECEIVABLE", "DEBIT"], ["ASSET", "CREDIT"]]],
  ["settlement", [["ASSET", "DEBIT"], ["RECEIVABLE", "CREDIT"]]],
];

for (const [name, sides] of balancedCases) {
  test(`balances ${name} in one currency`, () => {
    const postings = sides.map(([ledgerAccountId, side]) => ({
      ledgerAccountId,
      currency: "ARS",
      side,
      amount: "123.45",
    }));

    const normalized = validateBalancedPostings(postings);
    assert.equal(normalized.length, 2);
    assert.equal(normalized[0].amount.toFixed(2), "123.45");
  });
}

test("balances FX independently in both currencies", () => {
  assert.equal(
    validateBalancedPostings([
      { ledgerAccountId: "ARS", currency: "ARS", side: "CREDIT", amount: "1000.00" },
      { ledgerAccountId: "ARS_CLEARING", currency: "ARS", side: "DEBIT", amount: "1000.00" },
      { ledgerAccountId: "USD", currency: "USD", side: "DEBIT", amount: "1.00" },
      { ledgerAccountId: "USD_CLEARING", currency: "USD", side: "CREDIT", amount: "1.00" },
    ]).length,
    4
  );
});

test("rejects cross-currency entries without a balanced pair per currency", () => {
  assert.throws(
    () =>
      validateBalancedPostings([
        { ledgerAccountId: "ARS", currency: "ARS", side: "CREDIT", amount: "1000.00" },
        { ledgerAccountId: "USD", currency: "USD", side: "DEBIT", amount: "1.00" },
      ]),
    (error) =>
      error instanceof LedgerInvariantError &&
      error.code === "LEDGER_UNBALANCED_CURRENCY"
  );
});

test("rejects invalid amounts, currency and incomplete entries", () => {
  const valid = {
    ledgerAccountId: "account",
    currency: "ARS",
    side: "DEBIT",
    amount: "1.00",
  };

  for (const amount of ["0", "-1", "1.001", "1e3", "", "12345678901234567.00"]) {
    assert.throws(
      () => validateBalancedPostings([{ ...valid, amount }, { ...valid, side: "CREDIT", amount }]),
      (error) =>
        error instanceof LedgerInvariantError &&
        error.code === "LEDGER_INVALID_AMOUNT",
      amount
    );
  }

  assert.throws(
    () => validateBalancedPostings([valid]),
    (error) =>
      error instanceof LedgerInvariantError &&
      error.code === "LEDGER_MIN_POSTINGS"
  );
  assert.throws(
    () =>
      validateBalancedPostings([
        { ...valid, currency: "ars" },
        { ...valid, currency: "ars", side: "CREDIT" },
      ]),
    (error) =>
      error instanceof LedgerInvariantError &&
      error.code === "LEDGER_INVALID_CURRENCY"
  );
  assert.throws(
    () =>
      validateBalancedPostings([
        { ...valid, side: "INVALID" },
        { ...valid, side: "CREDIT" },
      ]),
    (error) =>
      error instanceof LedgerInvariantError &&
      error.code === "LEDGER_INVALID_SIDE"
  );
});

test("parses civil dates explicitly and rejects impossible dates", () => {
  const date = parseCivilDate("2026-08-10");
  assert.equal(date.toISOString(), "2026-08-10T00:00:00.000Z");

  for (const value of ["10/08/2026", "2026-02-30", "2026-13-01", ""] ) {
    assert.throws(
      () => parseCivilDate(value),
      (error) =>
        error instanceof LedgerInvariantError &&
        error.code === "LEDGER_INVALID_DATE",
      value
    );
  }
});

test("reversal swaps posting sides", () => {
  assert.equal(oppositePostingSide("DEBIT"), "CREDIT");
  assert.equal(oppositePostingSide("CREDIT"), "DEBIT");

  const reversal = validateBalancedPostings([
    { ledgerAccountId: "asset", currency: "ARS", side: oppositePostingSide("DEBIT"), amount: "25.00" },
    { ledgerAccountId: "income", currency: "ARS", side: oppositePostingSide("CREDIT"), amount: "25.00" },
  ]);
  assert.deepEqual(
    reversal.map((posting) => posting.side),
    ["CREDIT", "DEBIT"]
  );
});
