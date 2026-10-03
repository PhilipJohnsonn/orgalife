import assert from "node:assert/strict";
import test from "node:test";

import { Decimal } from "@prisma/client/runtime/client";

import { calculateCardProjection } from "./finance-card-projection.ts";

test("projects card debt against available money without mutating balances", () => {
  const projection = calculateCardProjection({
    liquid: new Map([
      ["ARS", new Decimal("500.00")],
      ["USD", new Decimal("20.00")],
    ]),
    cardDebt: new Map([
      ["ARS", new Decimal("200.00")],
      ["USD", new Decimal("50.00")],
    ]),
    rates: new Map([["ARS", "1300.00000000"]]),
  });

  assert.deepEqual(projection.byCurrency, [
    { currency: "ARS", available: "500.00", cardDebt: "200.00", shortfall: "0.00", afterCardDebt: "300.00" },
    { currency: "USD", available: "20.00", cardDebt: "50.00", shortfall: "30.00", afterCardDebt: "-30.00" },
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
    cardDebt: new Map([["USD", new Decimal("10.00")]]),
    rates: new Map(),
  });

  assert.equal(projection.usdPurchase.arsRequired, null);
});
