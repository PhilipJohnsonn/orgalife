import assert from "node:assert/strict";
import test from "node:test";

import {
  merchantFromDescription,
  monthRange,
  signedFlowAmount,
} from "./finance-month.ts";

const day = (date) => date.toISOString().slice(0, 10);

test("month range covers the month and the previous one", () => {
  const range = monthRange("2026-03");
  assert.equal(day(range.from), "2026-03-01");
  assert.equal(day(range.to), "2026-03-31");
  assert.equal(day(range.previousFrom), "2026-02-01");
  assert.equal(day(range.previousTo), "2026-02-28");
});

test("month range crosses year boundaries and rejects malformed months", () => {
  const range = monthRange("2026-01");
  assert.equal(day(range.previousFrom), "2025-12-01");
  assert.equal(day(range.previousTo), "2025-12-31");
  for (const value of ["2026-13", "2026-1", "26-01", ""]) assert.equal(monthRange(value), null);
});

test("flow sign follows the account kind", () => {
  assert.equal(signedFlowAmount("EXPENSE", "DEBIT", "10.00").toFixed(2), "10.00");
  assert.equal(signedFlowAmount("EXPENSE", "CREDIT", "10.00").toFixed(2), "-10.00");
  assert.equal(signedFlowAmount("INCOME", "CREDIT", "10.00").toFixed(2), "10.00");
  assert.equal(signedFlowAmount("INCOME", "DEBIT", "10.00").toFixed(2), "-10.00");
});

test("rules learn the merchant, not the note or converted amount", () => {
  assert.equal(merchantFromDescription("Uber — aeropuerto (30.40 AUD)"), "Uber");
  assert.equal(merchantFromDescription("Uber (30.40 AUD)"), "Uber");
  assert.equal(merchantFromDescription("WOOLWORTHS 1234 SYDNEY"), "WOOLWORTHS 1234 SYDNEY");
});
