import assert from "node:assert/strict";
import test from "node:test";

import { PersonError, assertPersonArchivable, parsePersonName } from "./finance-people.ts";

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
