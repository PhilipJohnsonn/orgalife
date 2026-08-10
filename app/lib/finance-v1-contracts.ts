export class RequestValidationError extends Error {
  readonly code = "INVALID_PAYLOAD";

  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export type IncomeExpenseCommand = {
  type: "INCOME" | "EXPENSE";
  accountId: string;
  amount: string;
  occurredOn: string;
  description: string;
  categoryId?: string;
  idempotencyKey: string;
};

const MONEY_PATTERN = /^\d{1,16}(?:\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredString(
  record: Record<string, unknown>,
  field: string
) {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${field} is required`);
  }
  return value.trim();
}

export function parseIncomeExpenseCommand(input: unknown): IncomeExpenseCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const type = record.type;
  if (type !== "INCOME" && type !== "EXPENSE") {
    throw new RequestValidationError("type must be INCOME or EXPENSE");
  }

  const amount = requiredString(record, "amount");
  if (!MONEY_PATTERN.test(amount) || Number(amount) <= 0) {
    throw new RequestValidationError("amount must be a positive decimal string");
  }
  const occurredOn = requiredString(record, "occurredOn");
  if (!DATE_PATTERN.test(occurredOn)) {
    throw new RequestValidationError("occurredOn must use YYYY-MM-DD");
  }
  const idempotencyKey = requiredString(record, "idempotencyKey");
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new RequestValidationError("idempotencyKey must be a UUID");
  }

  const categoryId = record.categoryId;
  if (categoryId !== undefined && (typeof categoryId !== "string" || !categoryId.trim())) {
    throw new RequestValidationError("categoryId must be a non-empty string");
  }

  return {
    type,
    accountId: requiredString(record, "accountId"),
    amount,
    occurredOn,
    description: requiredString(record, "description"),
    ...(typeof categoryId === "string" ? { categoryId: categoryId.trim() } : {}),
    idempotencyKey,
  };
}
