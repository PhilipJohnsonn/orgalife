import assert from "node:assert/strict";
import test from "node:test";

import {
  convertUsdPivotAmount,
  parseOpenExchangeRatesResponse,
} from "./finance-rates.ts";

const rates = new Map([
  ["ARS", "1300.00000000"],
  ["AUD", "1.50000000"],
]);

test("converts through the canonical USD pivot", () => {
  assert.equal(convertUsdPivotAmount("1300.00", "ARS", "USD", rates), "1.00");
  assert.equal(convertUsdPivotAmount("100.00", "USD", "AUD", rates), "150.00");
  assert.equal(convertUsdPivotAmount("1300.00", "ARS", "AUD", rates), "1.50");
  assert.equal(convertUsdPivotAmount("50.00", "AUD", "AUD", rates), "50.00");
});

test("returns null rather than inventing a conversion when a rate is missing", () => {
  assert.equal(convertUsdPivotAmount("100.00", "ARS", "AUD", new Map()), null);
});

test("validates the Open Exchange Rates USD response contract", () => {
  assert.deepEqual(
    parseOpenExchangeRatesResponse(
      { base: "USD", timestamp: 1786366800, rates: { ARS: 1300, AUD: 1.5 } },
      ["ARS", "AUD"]
    ),
    { base: "USD", timestamp: 1786366800, rates: { ARS: 1300, AUD: 1.5 } }
  );
  assert.throws(
    () => parseOpenExchangeRatesResponse({ base: "EUR", timestamp: 1, rates: { ARS: 1300 } }, ["ARS"]),
    /Invalid provider response/
  );
  assert.throws(
    () => parseOpenExchangeRatesResponse({ base: "USD", timestamp: 1, rates: {} }, ["ARS"]),
    /missing a requested rate/
  );
});
