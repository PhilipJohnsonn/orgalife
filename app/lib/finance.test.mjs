import assert from "node:assert/strict";
import test from "node:test";

import { calculateStatementTotal } from "./finance.ts";

test("uses persisted totals for a manual statement", () => {
  assert.deepEqual(
    calculateStatementTotal({
      amountARS: 125000,
      amountUSD: 45.5,
      expenses: [],
    }),
    {
      totalARS: 125000,
      totalUSD: 45.5,
      totalExcludedARS: 0,
    }
  );
});

test("calculates included and excluded totals for an imported statement", () => {
  assert.deepEqual(
    calculateStatementTotal({
      amountARS: 999999,
      amountUSD: 999,
      expenses: [
        { amountARS: 1000, amountUSD: null, isExcluded: false },
        { amountARS: null, amountUSD: 20, isExcluded: false },
        { amountARS: 300, amountUSD: null, isExcluded: true },
      ],
    }),
    {
      totalARS: 1000,
      totalUSD: 20,
      totalExcludedARS: 300,
    }
  );
});
