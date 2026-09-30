export class SharedExpenseError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "SharedExpenseError";
    this.code = code;
    this.status = status;
  }
}

export type SplitMode = "EQUAL" | "AMOUNTS" | "PERCENTAGES";

/** `me` and `value` are ignored in EQUAL; amounts in AMOUNTS; percentages (up to 2 decimals) in PERCENTAGES. */
export type SplitInput = {
  mode: SplitMode;
  me?: string;
  people: { personId: string; value?: string }[];
};

export type SplitResult = {
  me: string;
  people: { personId: string; amount: string }[];
};

export type SharedExpenseCommand = {
  amount: string;
  occurredOn: string;
  description: string;
  categoryId?: string;
  idempotencyKey: string;
  paidBy: { accountId: string } | { personId: string; currency: string };
  split: SplitInput;
  /** Reference only: what was charged in another currency before conversion. */
  original?: { amount: string; currency: string };
};

const DECIMAL_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** "12.3" → 1230. Amounts and percentages both have two decimals, so both fit in integer hundredths. */
function toHundredths(value: string, field: string) {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new SharedExpenseError("INVALID_SPLIT", `${field} debe ser un número con hasta 2 decimales`, 400);
  }
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function fromHundredths(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

/**
 * Splits `total` between you and the people. Leftover cents always go to your
 * share, so people never owe more than their exact part.
 */
export function splitSharedExpense(total: string, split: SplitInput): SplitResult {
  if (!["EQUAL", "AMOUNTS", "PERCENTAGES"].includes(split.mode)) {
    throw new SharedExpenseError("INVALID_SPLIT", "split.mode debe ser EQUAL, AMOUNTS o PERCENTAGES", 400);
  }
  const totalCents = toHundredths(total, "amount");
  if (totalCents <= 0) throw new SharedExpenseError("INVALID_AMOUNT", "El monto tiene que ser mayor a 0", 400);
  if (split.people.length === 0) {
    throw new SharedExpenseError("SPLIT_WITHOUT_PEOPLE", "Elegí al menos una persona para dividir");
  }
  const ids = split.people.map((person) => person.personId);
  if (new Set(ids).size !== ids.length) {
    throw new SharedExpenseError("SPLIT_DUPLICATE_PERSON", "Cada persona puede aparecer una sola vez");
  }

  let peopleCents: number[];
  if (split.mode === "EQUAL") {
    const share = Math.floor(totalCents / (split.people.length + 1));
    peopleCents = split.people.map(() => share);
  } else {
    const values = split.people.map((person, index) => toHundredths(person.value ?? "", `people[${index}].value`));
    const me = toHundredths(split.me ?? "", "me");
    if (values.some((value) => value <= 0)) {
      throw new SharedExpenseError("SPLIT_EMPTY_SHARE", "Cada persona tiene que tener una parte mayor a 0");
    }
    const sum = values.reduce((acc, value) => acc + value, me);
    if (split.mode === "AMOUNTS") {
      if (sum !== totalCents) {
        throw new SharedExpenseError("SPLIT_MISMATCH", `Las partes suman ${fromHundredths(sum)} y el total es ${fromHundredths(totalCents)}`);
      }
      peopleCents = values;
    } else {
      if (sum !== 10000) {
        throw new SharedExpenseError("SPLIT_MISMATCH", `Los porcentajes suman ${fromHundredths(sum)} y tienen que sumar 100`);
      }
      // value is in hundredths of a percent: cents * value / 10000, rounded down.
      peopleCents = values.map((value) => Math.floor((totalCents * value) / 10000));
    }
  }

  const meCents = totalCents - peopleCents.reduce((acc, value) => acc + value, 0);
  return {
    me: fromHundredths(meCents),
    people: split.people.map((person, index) => ({ personId: person.personId, amount: fromHundredths(peopleCents[index]) })),
  };
}

function record(input: unknown, field: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new SharedExpenseError("INVALID_PAYLOAD", `${field} debe ser un objeto`, 400);
  }
  return input as Record<string, unknown>;
}

function text(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new SharedExpenseError("INVALID_PAYLOAD", `${field} es obligatorio`, 400);
  }
  return value.trim();
}

function currency(source: Record<string, unknown>, field: string) {
  const value = text(source, field).toUpperCase();
  if (!CURRENCY_PATTERN.test(value)) throw new SharedExpenseError("INVALID_PAYLOAD", `${field} debe ser un código ISO 4217`, 400);
  return value;
}

/** Shape-checks a split; amounts are validated against a total by `splitSharedExpense`. */
export function parseSplit(input: unknown): SplitInput {
  const splitRecord = record(input, "split");
  if (!Array.isArray(splitRecord.people)) throw new SharedExpenseError("INVALID_PAYLOAD", "split.people debe ser una lista", 400);
  return {
    mode: splitRecord.mode as SplitMode,
    me: typeof splitRecord.me === "string" ? splitRecord.me : undefined,
    people: splitRecord.people.map((person, index) => {
      const item = record(person, `split.people[${index}]`);
      return { personId: text(item, "personId"), value: typeof item.value === "string" ? item.value : undefined };
    }),
  };
}

export function parseSharedExpenseCommand(input: unknown): SharedExpenseCommand {
  const body = record(input, "body");
  const amount = text(body, "amount");
  const occurredOn = text(body, "occurredOn");
  if (!DATE_PATTERN.test(occurredOn)) throw new SharedExpenseError("INVALID_PAYLOAD", "occurredOn debe ser YYYY-MM-DD", 400);
  const idempotencyKey = text(body, "idempotencyKey");
  if (!UUID_PATTERN.test(idempotencyKey)) throw new SharedExpenseError("INVALID_PAYLOAD", "idempotencyKey debe ser un UUID", 400);
  const categoryId = body.categoryId === undefined ? undefined : text(body, "categoryId");

  const paidByRecord = record(body.paidBy, "paidBy");
  const paidBy = paidByRecord.accountId !== undefined
    ? { accountId: text(paidByRecord, "accountId") }
    : { personId: text(paidByRecord, "personId"), currency: currency(paidByRecord, "currency") };

  const split = parseSplit(body.split);
  // Validates amounts and mode up front, so the service only deals with the ledger.
  splitSharedExpense(amount, split);

  const originalRecord = body.original === undefined ? undefined : record(body.original, "original");
  const original = originalRecord
    ? { amount: fromHundredths(toHundredths(text(originalRecord, "amount"), "original.amount")), currency: currency(originalRecord, "currency") }
    : undefined;

  return { amount, occurredOn, description: text(body, "description"), categoryId, idempotencyKey, paidBy, split, original };
}
