import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const fixtureDirectory = new URL("../fixtures/finance/icbc-visa/", import.meta.url);
const expectedFiles = (await readdir(fixtureDirectory))
  .filter((file) => file.endsWith(".expected.json"))
  .sort();

const newChargeClassifications = new Set([
  "PURCHASE",
  "ELIGIBLE_USD_TAX",
  "PAYABLE_TAX",
  "INTEREST",
  "FEE",
]);

async function loadJson(file) {
  return JSON.parse(await readFile(new URL(file, fixtureDirectory), "utf8"));
}

test("ICBC fixtures are paired, sanitized and balanced by currency", async () => {
  assert.equal(expectedFiles.length, 4);

  for (const expectedFile of expectedFiles) {
    const itemsFile = expectedFile.replace(".expected.json", ".items.json");
    const [expected, extracted] = await Promise.all([
      loadJson(expectedFile),
      loadJson(itemsFile),
    ]);

    assert.equal(extracted.case, expected.case);
    assert.equal(extracted.parser, "ICBC_VISA");
    assert.equal(expected.parser, "ICBC_VISA");
    assert.equal(extracted.pageCount, 4);
    assert.ok(extracted.items.every((item) => item.page >= 1 && item.page <= 4));

    const extractedText = extracted.items.map((item) => item.str).join("\n");
    assert.doesNotMatch(
      extractedText,
      /TITULAR|NRO[.]?DE CUENTA|SUCURSAL|CUIT|RESUMEN NRO|\d{10,}/i
    );

    const newChargeTotals = new Map();
    for (const line of expected.statement.lines) {
      if (!newChargeClassifications.has(line.classification)) continue;
      const previous = newChargeTotals.get(line.billedCurrency) ?? 0;
      newChargeTotals.set(line.billedCurrency, previous + Number(line.billedAmount));
    }

    for (const total of expected.statement.totals) {
      const reported =
        Number(total.previousBalance) +
        Number(total.paymentsAndCredits) +
        Number(total.newCharges);
      assert.ok(Math.abs(reported - Number(total.reportedTotal)) <= 0.001);

      const payable = Number(total.reportedTotal) - Number(total.eligibleExclusions);
      assert.ok(Math.abs(payable - Number(total.payableTotal)) <= 0.001);
      assert.ok(Math.abs(Number(total.residual)) <= 0.001);

      const lineTotal = newChargeTotals.get(total.currency) ?? 0;
      assert.ok(Math.abs(lineTotal - Number(total.newCharges)) <= 0.001);
    }
  }
});

test("ICBC fixture series covers the observed tax-credit lifecycle and currencies", async () => {
  const fixtures = await Promise.all(expectedFiles.map(loadJson));
  const lines = fixtures.flatMap((fixture) => fixture.statement.lines);
  const originalCurrencies = new Set(
    lines.map((line) => line.originalCurrency).filter(Boolean)
  );
  const classifications = new Set(lines.map((line) => line.classification));

  assert.ok(originalCurrencies.has("THB"));
  assert.ok(originalCurrencies.has("IDR"));
  assert.ok(originalCurrencies.has("AUD"));
  assert.ok(classifications.has("PREVIOUS_BALANCE"));
  assert.ok(classifications.has("PAYMENT_OR_CREDIT"));
  assert.ok(classifications.has("ELIGIBLE_USD_TAX"));
  assert.ok(classifications.has("PAYABLE_TAX"));

  for (let index = 1; index < fixtures.length; index += 1) {
    const previousKey = `tax-cycle-0${index}`;
    const resolved = fixtures[index].statement.taxExclusions.find(
      (exclusion) => exclusion.key === previousKey
    );
    assert.equal(resolved?.status, "CONFIRMED_NOT_CHARGED");
    assert.equal(resolved?.resolution, "CREDIT_LINE");
  }
});
