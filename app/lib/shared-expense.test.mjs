import assert from "node:assert/strict";
import test from "node:test";

import { SharedExpenseError, parseSharedExpenseCommand, splitSharedExpense } from "./shared-expense.ts";

const people = (...ids) => ids.map((personId) => ({ personId }));

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof SharedExpenseError && error.code === code);
}

test("splits equally and gives leftover cents to you", () => {
  assert.deepEqual(splitSharedExpense("60", { mode: "EQUAL", people: people("a", "b") }), {
    me: "20.00",
    people: [{ personId: "a", amount: "20.00" }, { personId: "b", amount: "20.00" }],
  });
  assert.deepEqual(splitSharedExpense("100.00", { mode: "EQUAL", people: people("a", "b") }), {
    me: "33.34",
    people: [{ personId: "a", amount: "33.33" }, { personId: "b", amount: "33.33" }],
  });
  assert.deepEqual(splitSharedExpense("0.01", { mode: "EQUAL", people: people("a") }), {
    me: "0.01",
    people: [{ personId: "a", amount: "0.00" }],
  });
});

test("splits by exact amounts that must add up to the total", () => {
  assert.deepEqual(
    splitSharedExpense("60.00", { mode: "AMOUNTS", me: "10", people: [{ personId: "a", value: "50.00" }] }),
    { me: "10.00", people: [{ personId: "a", amount: "50.00" }] }
  );
  assert.equal(
    splitSharedExpense("60", { mode: "AMOUNTS", me: "0", people: [{ personId: "a", value: "60" }] }).me,
    "0.00"
  );
  throwsCode(() => splitSharedExpense("60", { mode: "AMOUNTS", me: "10", people: [{ personId: "a", value: "40" }] }), "SPLIT_MISMATCH");
});

test("splits by percentages rounding people down", () => {
  assert.deepEqual(
    splitSharedExpense("100", {
      mode: "PERCENTAGES",
      me: "33.34",
      people: [{ personId: "a", value: "33.33" }, { personId: "b", value: "33.33" }],
    }),
    { me: "33.34", people: [{ personId: "a", amount: "33.33" }, { personId: "b", amount: "33.33" }] }
  );
  assert.deepEqual(
    splitSharedExpense("10.01", { mode: "PERCENTAGES", me: "50", people: [{ personId: "a", value: "50" }] }),
    { me: "5.01", people: [{ personId: "a", amount: "5.00" }] }
  );
  throwsCode(() => splitSharedExpense("10", { mode: "PERCENTAGES", me: "50", people: [{ personId: "a", value: "40" }] }), "SPLIT_MISMATCH");
});

test("rejects invalid splits", () => {
  throwsCode(() => splitSharedExpense("60", { mode: "EQUAL", people: [] }), "SPLIT_WITHOUT_PEOPLE");
  throwsCode(() => splitSharedExpense("60", { mode: "EQUAL", people: people("a", "a") }), "SPLIT_DUPLICATE_PERSON");
  throwsCode(() => splitSharedExpense("0", { mode: "EQUAL", people: people("a") }), "INVALID_AMOUNT");
  throwsCode(() => splitSharedExpense("60", { mode: "HALF", people: people("a") }), "INVALID_SPLIT");
  throwsCode(() => splitSharedExpense("60", { mode: "AMOUNTS", me: "60", people: [{ personId: "a", value: "0" }] }), "SPLIT_EMPTY_SHARE");
  throwsCode(() => splitSharedExpense("60", { mode: "AMOUNTS", people: [{ personId: "a", value: "60" }] }), "INVALID_SPLIT");
});

test("parses a shared expense command", () => {
  const base = {
    amount: "60.00",
    occurredOn: "2026-09-30",
    description: " Cena ",
    idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
    split: { mode: "EQUAL", people: [{ personId: "a" }, { personId: "b" }] },
  };
  assert.deepEqual(parseSharedExpenseCommand({ ...base, paidBy: { accountId: "acc" } }), {
    amount: "60.00",
    occurredOn: "2026-09-30",
    description: "Cena",
    categoryId: undefined,
    idempotencyKey: base.idempotencyKey,
    paidBy: { accountId: "acc" },
    split: { mode: "EQUAL", me: undefined, people: [{ personId: "a", value: undefined }, { personId: "b", value: undefined }] },
    original: undefined,
  });
  const byPerson = parseSharedExpenseCommand({
    ...base,
    paidBy: { personId: "a", currency: "eur" },
    original: { amount: "100", currency: "jpy" },
  });
  assert.deepEqual(byPerson.paidBy, { personId: "a", currency: "EUR" });
  assert.deepEqual(byPerson.original, { amount: "100.00", currency: "JPY" });

  throwsCode(() => parseSharedExpenseCommand({ ...base, paidBy: { accountId: "acc" }, idempotencyKey: "x" }), "INVALID_PAYLOAD");
  throwsCode(() => parseSharedExpenseCommand({ ...base, paidBy: { personId: "a" } }), "INVALID_PAYLOAD");
  throwsCode(() => parseSharedExpenseCommand({ ...base, paidBy: { accountId: "acc" }, split: { mode: "EQUAL" } }), "INVALID_PAYLOAD");
});
