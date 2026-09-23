import assert from "node:assert/strict";
import test from "node:test";

import { computeCommitmentEndsOn } from "./finance-commitment-dates.ts";

test("N=1 returns startsOn unchanged for both frequencies", () => {
  assert.equal(computeCommitmentEndsOn("WEEKLY", "2026-01-01", 1), "2026-01-01");
  assert.equal(computeCommitmentEndsOn("MONTHLY", "2026-01-31", 1), "2026-01-31");
});

test("WEEKLY adds 7 days per extra payment", () => {
  assert.equal(computeCommitmentEndsOn("WEEKLY", "2026-01-01", 2), "2026-01-08");
  assert.equal(computeCommitmentEndsOn("WEEKLY", "2026-01-01", 5), "2026-01-29");
});

test("MONTHLY adds calendar months and clamps to month end", () => {
  // Jan 31 -> Feb has only 28 days in 2026 (not a leap year).
  assert.equal(computeCommitmentEndsOn("MONTHLY", "2026-01-31", 2), "2026-02-28");
  // The 3rd payment counts from the original day (31), not the clamped one.
  assert.equal(computeCommitmentEndsOn("MONTHLY", "2026-01-31", 3), "2026-03-31");
});

test("MONTHLY clamps to Feb 29 on a leap year", () => {
  assert.equal(computeCommitmentEndsOn("MONTHLY", "2024-01-31", 2), "2024-02-29");
});

test("MONTHLY rolls over into the next year", () => {
  assert.equal(computeCommitmentEndsOn("MONTHLY", "2026-11-15", 3), "2027-01-15");
});
