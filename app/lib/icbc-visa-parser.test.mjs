import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IcbcVisaParserError,
  parseIcbcVisaLayout,
} from "./icbc-visa-parser.ts";

const fixtureDirectory = new URL(
  "../../tests/fixtures/finance/icbc-visa/",
  import.meta.url
);

async function readFixture(name, suffix) {
  return JSON.parse(
    await readFile(new URL(`${name}.${suffix}.json`, fixtureDirectory), "utf8")
  );
}

test("parses and reconciles four consecutive ICBC Visa cycles", async () => {
  let pendingTaxExclusions = [];

  for (const cycle of ["01", "02", "03", "04"]) {
    const name = `consecutive-tax-credit-${cycle}`;
    const input = await readFixture(name, "items");
    const expected = await readFixture(name, "expected");

    const actual = parseIcbcVisaLayout(input.items, {
      pendingTaxExclusions,
      newTaxExclusionKeys: [`tax-cycle-${cycle}`],
    });

    const expectedParserOutput = {
      parser: expected.parser,
      parserVersion: expected.parserVersion,
      statement: expected.statement,
    };
    assert.deepEqual(actual, expectedParserOutput, name);
    pendingTaxExclusions = actual.statement.taxExclusions.filter(
      (exclusion) => exclusion.status === "PENDING_CONFIRMATION"
    );
  }
});

test("rejects an unsupported or incomplete layout", () => {
  assert.throws(
    () => parseIcbcVisaLayout([{ page: 1, str: "not a statement", x: 10, y: 10 }]),
    (error) =>
      error instanceof IcbcVisaParserError &&
      error.code === "ICBC_UNSUPPORTED_LAYOUT"
  );
});
