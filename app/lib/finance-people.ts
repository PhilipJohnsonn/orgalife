export class PersonError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "PersonError";
    this.code = code;
    this.status = status;
  }
}

export const PERSON_NAME_MAX_LENGTH = 60;

export function parsePersonName(input: unknown): string {
  const name = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new PersonError("PERSON_NAME_REQUIRED", 422, "El nombre es obligatorio");
  if (name.length > PERSON_NAME_MAX_LENGTH) {
    throw new PersonError("PERSON_NAME_TOO_LONG", 422, `El nombre admite hasta ${PERSON_NAME_MAX_LENGTH} caracteres`);
  }
  return name;
}

/** A person can only be archived once every currency balance is back to zero. */
export function assertPersonArchivable(name: string, balances: { currency: string; balance: string }[]) {
  const open = balances.filter((item) => Number(item.balance) !== 0);
  if (open.length > 0) {
    throw new PersonError(
      "PERSON_HAS_BALANCE",
      409,
      `${name} tiene saldo ${open.map((item) => `${item.balance} ${item.currency}`).join(", ")}. Llevá el saldo a 0 primero.`
    );
  }
}

export type SettlementDirection = "RECEIVED" | "PAID";

export type PersonSettlementCommand = {
  personId: string;
  /** RECEIVED: te pagó. PAID: le pagaste. */
  direction: SettlementDirection;
  accountId: string;
  /** In the account's currency. */
  amount: string;
  /** Only when the debt is in another currency: how much of it this settles. */
  debt?: { currency: string; amount: string };
  occurredOn: string;
  description?: string;
  idempotencyKey: string;
};

const MONEY_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message: string): never {
  throw new PersonError("INVALID_PAYLOAD", 400, message);
}

function field(source: Record<string, unknown>, name: string) {
  const value = source[name];
  if (typeof value !== "string" || !value.trim()) invalid(`${name} es obligatorio`);
  return value.trim();
}

function money(source: Record<string, unknown>, name: string) {
  const value = field(source, name);
  if (!MONEY_PATTERN.test(value) || Number(value) <= 0) invalid(`${name} tiene que ser un monto mayor a 0`);
  return value;
}

export function parsePersonSettlementCommand(input: unknown): PersonSettlementCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("body debe ser un objeto");
  const body = input as Record<string, unknown>;
  const direction = body.direction;
  if (direction !== "RECEIVED" && direction !== "PAID") invalid("direction debe ser RECEIVED o PAID");
  const occurredOn = field(body, "occurredOn");
  if (!DATE_PATTERN.test(occurredOn)) invalid("occurredOn debe ser YYYY-MM-DD");
  const idempotencyKey = field(body, "idempotencyKey");
  if (!UUID_PATTERN.test(idempotencyKey)) invalid("idempotencyKey debe ser un UUID");

  let debt: PersonSettlementCommand["debt"];
  if (body.debt !== undefined) {
    if (!body.debt || typeof body.debt !== "object" || Array.isArray(body.debt)) invalid("debt debe ser un objeto");
    const debtRecord = body.debt as Record<string, unknown>;
    const currency = field(debtRecord, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) invalid("debt.currency debe ser un código ISO 4217");
    debt = { currency, amount: money(debtRecord, "amount") };
  }

  return {
    personId: field(body, "personId"),
    direction,
    accountId: field(body, "accountId"),
    amount: money(body, "amount"),
    debt,
    occurredOn,
    description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : undefined,
    idempotencyKey,
  };
}

/**
 * Settling only moves a balance toward zero: RECEIVED needs them to owe you,
 * PAID needs you to owe them, and neither can overshoot.
 */
export function assertSettlementFits(
  name: string,
  direction: SettlementDirection,
  currency: string,
  balance: string,
  amount: string
) {
  const owed = direction === "RECEIVED" ? Number(balance) : -Number(balance);
  if (owed <= 0) {
    throw new PersonError(
      "SETTLEMENT_WRONG_DIRECTION",
      422,
      direction === "RECEIVED" ? `${name} no te debe ${currency}` : `No le debés ${currency} a ${name}`
    );
  }
  if (Math.round(Number(amount) * 100) > Math.round(owed * 100)) {
    throw new PersonError("SETTLEMENT_EXCEEDS_BALANCE", 422, `El saldo en ${currency} es ${owed.toFixed(2)}`);
  }
}
