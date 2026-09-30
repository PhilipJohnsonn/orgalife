import assert from "node:assert/strict";
import test from "node:test";

import {
  CurrencyError,
  assertCurrencyRemovable,
  parseCurrencyCode,
  searchCurrencies,
} from "./finance-currencies.ts";

test("normalizes and accepts ISO 4217 currency codes", () => {
  assert.equal(parseCurrencyCode("EUR"), "EUR");
  assert.equal(parseCurrencyCode(" eur "), "EUR");
});

test("rejects codes that are not ISO 4217", () => {
  for (const input of ["XYZ", "EU", "EURO", "", null, 978]) {
    assert.throws(
      () => parseCurrencyCode(input),
      (error) => error instanceof CurrencyError && error.code === "INVALID_CURRENCY" && error.status === 400
    );
  }
});

test("blocks removing a currency held by an active account", () => {
  const accounts = [
    { name: "Revolut AUD", currency: "AUD" },
    { name: "Wise AUD", currency: "AUD" },
    { name: "ICBC ARS", currency: "ARS" },
  ];
  assert.throws(
    () => assertCurrencyRemovable("AUD", accounts),
    (error) =>
      error instanceof CurrencyError &&
      error.code === "CURRENCY_IN_USE" &&
      error.status === 409 &&
      error.message.includes("Revolut AUD, Wise AUD")
  );
  assert.doesNotThrow(() => assertCurrencyRemovable("EUR", accounts));
});

test("searches currencies by code or accent-insensitive Spanish name", () => {
  assert.deepEqual(searchCurrencies("eur", [])[0], { code: "EUR", name: "euro" });
  assert.equal(searchCurrencies("Euro", [])[0].code, "EUR");
  assert.ok(searchCurrencies("libra", []).some((option) => option.code === "GBP"));
  assert.ok(searchCurrencies("neozelandes", []).some((option) => option.code === "NZD"));
  assert.deepEqual(searchCurrencies("  ", []), []);
});

test("search skips enabled currencies, ranks code matches first and honors the limit", () => {
  assert.ok(!searchCurrencies("eur", ["EUR"]).some((option) => option.code === "EUR"));
  assert.equal(searchCurrencies("us", [])[0].code, "USD");
  assert.ok(searchCurrencies("dólar", [], 3).length === 3);
});
