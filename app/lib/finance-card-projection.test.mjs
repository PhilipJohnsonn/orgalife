import assert from "node:assert/strict";
import test from "node:test";

import { Decimal } from "@prisma/client/runtime/client";

import { calculateCardProjection } from "./finance-card-projection.ts";

test("projects billed and unbilled card debt without mutating balances", () => {
  const projection = calculateCardProjection({
    liquid: new Map([
      ["ARS", new Decimal("500.00")],
      ["USD", new Decimal("20.00")],
    ]),
    billedDebt: new Map([
      ["ARS", new Decimal("200.00")],
      ["USD", new Decimal("50.00")],
    ]),
    unbilled: new Map([["ARS", new Decimal("25.00")]]),
    rates: new Map([["ARS", "1300.00000000"]]),
  });

  assert.deepEqual(projection.byCurrency, [
    { currency: "ARS", available: "500.00", billedDebt: "200.00", unbilled: "25.00", billedShortfall: "0.00", afterBilled: "300.00", afterAll: "275.00" },
    { currency: "USD", available: "20.00", billedDebt: "50.00", unbilled: "0.00", billedShortfall: "30.00", afterBilled: "-30.00", afterAll: "-30.00" },
  ]);
  assert.deepEqual(projection.usdPurchase, {
    shortfallUsd: "30.00",
    arsRequired: "39000.00",
    rateArsPerUsd: "1300.00000000",
  });
});

test("does not invent an ARS requirement without a rate", () => {
  const projection = calculateCardProjection({
    liquid: new Map(),
    billedDebt: new Map([["USD", new Decimal("10.00")]]),
    unbilled: new Map(),
    rates: new Map(),
  });

  assert.equal(projection.usdPurchase.arsRequired, null);
});
