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

export type CreateAccountCommand = {
  groupName: string;
  region: "ARGENTINA" | "AUSTRALIA" | "GLOBAL";
  groupType: "BANK" | "WALLET" | "CARD" | "OTHER";
  accountName: string;
  currency: string;
  trackingMode: "TRANSACTIONAL" | "DECLARED";
  openingBalance: string;
  openingOn?: string;
};

type AccountMovementCommand = {
  sourceAccountId: string;
  destinationAccountId: string;
  occurredOn: string;
  description: string;
  idempotencyKey: string;
};

export type TransferCommand = AccountMovementCommand & {
  amount: string;
};

export type FxCommand = AccountMovementCommand & {
  sourceAmount: string;
  destinationAmount: string;
  referenceSnapshotIds?: string[];
};

export type ManualRateCommand = {
  quoteCurrency: string;
  rate: string;
  appliedOn: string;
};

export type BaseCurrencyCommand = { baseCurrency: string };

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

function positiveMoney(record: Record<string, unknown>, field: string) {
  const amount = requiredString(record, field);
  if (!MONEY_PATTERN.test(amount) || Number(amount) <= 0) {
    throw new RequestValidationError(`${field} must be a positive decimal string`);
  }
  return amount;
}

function parseAccountMovement(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const sourceAccountId = requiredString(record, "sourceAccountId");
  const destinationAccountId = requiredString(record, "destinationAccountId");
  if (sourceAccountId === destinationAccountId) {
    throw new RequestValidationError("sourceAccountId and destinationAccountId must differ");
  }
  const occurredOn = requiredString(record, "occurredOn");
  if (!DATE_PATTERN.test(occurredOn)) {
    throw new RequestValidationError("occurredOn must use YYYY-MM-DD");
  }
  const idempotencyKey = requiredString(record, "idempotencyKey");
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new RequestValidationError("idempotencyKey must be a UUID");
  }

  return {
    record,
    sourceAccountId,
    destinationAccountId,
    occurredOn,
    description: requiredString(record, "description"),
    idempotencyKey,
  };
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

  const amount = positiveMoney(record, "amount");
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

export function parseTransferCommand(input: unknown): TransferCommand {
  const { record, ...common } = parseAccountMovement(input);
  return { ...common, amount: positiveMoney(record, "amount") };
}

export function parseFxCommand(input: unknown): FxCommand {
  const { record, ...common } = parseAccountMovement(input);
  const referenceSnapshotIds = record.referenceSnapshotIds;
  if (
    referenceSnapshotIds !== undefined &&
    (!Array.isArray(referenceSnapshotIds) ||
      referenceSnapshotIds.length > 2 ||
      referenceSnapshotIds.some(
        (value) => typeof value !== "string" || !value.trim()
      ))
  ) {
    throw new RequestValidationError(
      "referenceSnapshotIds must contain at most two IDs"
    );
  }

  return {
    ...common,
    sourceAmount: positiveMoney(record, "sourceAmount"),
    destinationAmount: positiveMoney(record, "destinationAmount"),
    ...(Array.isArray(referenceSnapshotIds)
      ? {
          referenceSnapshotIds: [
            ...new Set(referenceSnapshotIds.map((value) => String(value).trim())),
          ],
        }
      : {}),
  };
}

export function parseManualRateCommand(input: unknown): ManualRateCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const quoteCurrency = requiredString(record, "quoteCurrency");
  if (!/^[A-Z]{3}$/.test(quoteCurrency) || quoteCurrency === "USD") {
    throw new RequestValidationError("quoteCurrency must be a non-USD ISO 4217 code");
  }
  const rate = requiredString(record, "rate");
  if (!/^\d{1,16}(?:\.\d{1,8})?$/.test(rate) || Number(rate) <= 0) {
    throw new RequestValidationError("rate must be a positive decimal string with at most 8 decimals");
  }
  const appliedOn = requiredString(record, "appliedOn");
  if (!DATE_PATTERN.test(appliedOn)) {
    throw new RequestValidationError("appliedOn must use YYYY-MM-DD");
  }
  return { quoteCurrency, rate, appliedOn };
}

export function parseBaseCurrencyCommand(input: unknown): BaseCurrencyCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const baseCurrency = requiredString(
    input as Record<string, unknown>,
    "baseCurrency"
  );
  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    throw new RequestValidationError("baseCurrency must be an ISO 4217 code");
  }
  return { baseCurrency };
}

export function parseCreateAccountCommand(input: unknown): CreateAccountCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const region = record.region;
  if (!(["ARGENTINA", "AUSTRALIA", "GLOBAL"] as unknown[]).includes(region)) {
    throw new RequestValidationError("region is invalid");
  }
  const groupType = record.groupType;
  if (!(["BANK", "WALLET", "CARD", "OTHER"] as unknown[]).includes(groupType)) {
    throw new RequestValidationError("groupType is invalid");
  }
  const trackingMode = record.trackingMode;
  if (trackingMode !== "TRANSACTIONAL" && trackingMode !== "DECLARED") {
    throw new RequestValidationError("trackingMode is invalid");
  }
  const currency = requiredString(record, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RequestValidationError("currency must be an ISO 4217 code");
  }
  const openingBalance = requiredString(record, "openingBalance");
  if (!/^-?\d{1,16}(?:\.\d{1,2})?$/.test(openingBalance)) {
    throw new RequestValidationError("openingBalance must be a decimal string");
  }
  const openingOn = record.openingOn;
  if (openingOn !== undefined && (typeof openingOn !== "string" || !DATE_PATTERN.test(openingOn))) {
    throw new RequestValidationError("openingOn must use YYYY-MM-DD");
  }

  return {
    groupName: requiredString(record, "groupName"),
    region: region as CreateAccountCommand["region"],
    groupType: groupType as CreateAccountCommand["groupType"],
    accountName: requiredString(record, "accountName"),
    currency,
    trackingMode,
    openingBalance,
    ...(typeof openingOn === "string" ? { openingOn } : {}),
  };
}
