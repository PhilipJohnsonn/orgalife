import { Decimal } from "@prisma/client/runtime/client";

export class CardPaymentError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "CardPaymentError";
    this.code = code;
    this.status = status;
  }
}

export const CARD_DIFFERENCE_CATEGORY_NAME = "Tarjeta: cambio y cargos";

export type CardPaymentCommand = {
  cardGroupId: string;
  occurredOn: string;
  /** Present when the payment covers the whole statement: the difference is booked against it. */
  closingOn?: string;
  payments: { currency: string; sourceAccountId: string; amount: string }[];
  idempotencyKey: string;
};

const MONEY_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message: string): never {
  throw new CardPaymentError("INVALID_PAYLOAD", 400, message);
}

function field(source: Record<string, unknown>, name: string) {
  const value = source[name];
  if (typeof value !== "string" || !value.trim()) invalid(`${name} es obligatorio`);
  return value.trim();
}

function date(source: Record<string, unknown>, name: string) {
  const value = field(source, name);
  if (!DATE_PATTERN.test(value)) invalid(`${name} debe ser YYYY-MM-DD`);
  return value;
}

export function parseCardPaymentCommand(input: unknown): CardPaymentCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("body debe ser un objeto");
  const body = input as Record<string, unknown>;
  const occurredOn = date(body, "occurredOn");
  const closingOn = body.closingOn === undefined ? undefined : date(body, "closingOn");
  if (closingOn && closingOn > occurredOn) invalid("El cierre no puede ser posterior al pago");
  const idempotencyKey = field(body, "idempotencyKey");
  if (!UUID_PATTERN.test(idempotencyKey)) invalid("idempotencyKey debe ser un UUID");
  if (!Array.isArray(body.payments) || body.payments.length === 0) invalid("Ingresá al menos un monto pagado");

  const payments = body.payments.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid("payments debe ser una lista de objetos");
    const payment = item as Record<string, unknown>;
    const currency = field(payment, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) invalid("currency debe ser un código ISO 4217");
    const amount = field(payment, "amount");
    if (!MONEY_PATTERN.test(amount) || Number(amount) <= 0) invalid("amount tiene que ser un monto mayor a 0");
    return { currency, sourceAccountId: field(payment, "sourceAccountId"), amount };
  });
  if (new Set(payments.map((payment) => payment.currency)).size !== payments.length) {
    invalid("Hay más de un pago en la misma moneda");
  }

  return { cardGroupId: field(body, "cardGroupId"), occurredOn, closingOn, payments, idempotencyKey };
}

export type CardLiabilityPosting = {
  side: "DEBIT" | "CREDIT";
  amount: string;
  occurredOn: string;
  /** Payments and statement differences: they settle earlier charges whatever their date. */
  settlement: boolean;
};

/**
 * What the statement closed on `closingOn` should still owe: every charge up to
 * the closing date, minus every payment and difference already recorded.
 */
export function cardDebtAtClosing(postings: CardLiabilityPosting[], closingOn: string) {
  let debt = new Decimal(0);
  for (const posting of postings) {
    if (!posting.settlement && posting.occurredOn > closingOn) continue;
    const amount = new Decimal(posting.amount);
    debt = posting.side === "CREDIT" ? debt.plus(amount) : debt.minus(amount);
  }
  return debt.toFixed(2);
}

/** Positive: the bank charged more than recorded (FX spread, taxes, fees). Negative: less. */
export function statementDifference(paid: string, debt: string) {
  return new Decimal(paid).minus(debt).toFixed(2);
}
