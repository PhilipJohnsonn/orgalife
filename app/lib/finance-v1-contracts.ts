import { createHash } from "crypto";

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

export type CardPaymentCommand = {
  statementId: string;
  sourceAccountId: string;
  amount: string;
  occurredOn: string;
  idempotencyKey: string;
};

export type ProvisionalCardPurchaseCommand = {
  cardGroupId: string;
  currency: string;
  amount: string;
  occurredOn: string;
  description: string;
  categoryId?: string;
  idempotencyKey: string;
};

export type CreateObligationCommand = {
  direction: "RECEIVABLE" | "PAYABLE";
  originType: "ACCOUNT_MOVEMENT" | "OPENING_BALANCE";
  counterparty: string;
  description: string;
  currency: string;
  amount: string;
  occurredOn: string;
  dueOn?: string;
  assetAccountId?: string;
  idempotencyKey: string;
};

export type SettleObligationCommand = {
  obligationId: string;
  assetAccountId: string;
  amount: string;
  occurredOn: string;
  idempotencyKey: string;
};

export type RecurringCommitmentCommand = {
  name: string;
  expectedAmount: string;
  currency: string;
  frequency: "ONCE" | "WEEKLY" | "MONTHLY";
  startsOn: string;
  endsOn?: string;
  categoryId?: string;
  expectedAccountId?: string;
};

export type CategoryRuleCommand = {
  pattern: string;
  categoryId: string;
  priority: number;
};

export type CategorizeStatementLineCommand = {
  categoryId: string;
  learnRule: boolean;
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

export function parseCardPaymentCommand(input: unknown): CardPaymentCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const occurredOn = requiredString(record, "occurredOn");
  if (!DATE_PATTERN.test(occurredOn)) {
    throw new RequestValidationError("occurredOn must use YYYY-MM-DD");
  }
  const idempotencyKey = requiredString(record, "idempotencyKey");
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new RequestValidationError("idempotencyKey must be a UUID");
  }
  return {
    statementId: requiredString(record, "statementId"),
    sourceAccountId: requiredString(record, "sourceAccountId"),
    amount: positiveMoney(record, "amount"),
    occurredOn,
    idempotencyKey,
  };
}

export function parseProvisionalCardPurchaseCommand(
  input: unknown
): ProvisionalCardPurchaseCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const currency = requiredString(record, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RequestValidationError("currency must be an ISO 4217 code");
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
    cardGroupId: requiredString(record, "cardGroupId"),
    currency,
    amount: positiveMoney(record, "amount"),
    occurredOn,
    description: requiredString(record, "description"),
    ...(typeof categoryId === "string" ? { categoryId: categoryId.trim() } : {}),
    idempotencyKey,
  };
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

export function parseCreateObligationCommand(input: unknown): CreateObligationCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const direction = record.direction;
  if (direction !== "RECEIVABLE" && direction !== "PAYABLE") {
    throw new RequestValidationError("direction must be RECEIVABLE or PAYABLE");
  }
  const originType = record.originType;
  if (originType !== "ACCOUNT_MOVEMENT" && originType !== "OPENING_BALANCE") {
    throw new RequestValidationError("originType is invalid");
  }
  const currency = requiredString(record, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RequestValidationError("currency must be an ISO 4217 code");
  }
  const occurredOn = requiredString(record, "occurredOn");
  if (!DATE_PATTERN.test(occurredOn)) {
    throw new RequestValidationError("occurredOn must use YYYY-MM-DD");
  }
  const dueOn = record.dueOn;
  if (dueOn !== undefined && (typeof dueOn !== "string" || !DATE_PATTERN.test(dueOn))) {
    throw new RequestValidationError("dueOn must use YYYY-MM-DD");
  }
  const assetAccountId = record.assetAccountId;
  if (originType === "ACCOUNT_MOVEMENT" && (typeof assetAccountId !== "string" || !assetAccountId.trim())) {
    throw new RequestValidationError("assetAccountId is required for an account movement");
  }
  const idempotencyKey = requiredString(record, "idempotencyKey");
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new RequestValidationError("idempotencyKey must be a UUID");
  }
  return {
    direction,
    originType,
    counterparty: requiredString(record, "counterparty"),
    description: requiredString(record, "description"),
    currency,
    amount: positiveMoney(record, "amount"),
    occurredOn,
    ...(typeof dueOn === "string" ? { dueOn } : {}),
    ...(typeof assetAccountId === "string" ? { assetAccountId: assetAccountId.trim() } : {}),
    idempotencyKey,
  };
}

export function parseSettleObligationCommand(input: unknown): SettleObligationCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const occurredOn = requiredString(record, "occurredOn");
  if (!DATE_PATTERN.test(occurredOn)) {
    throw new RequestValidationError("occurredOn must use YYYY-MM-DD");
  }
  const idempotencyKey = requiredString(record, "idempotencyKey");
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new RequestValidationError("idempotencyKey must be a UUID");
  }
  return {
    obligationId: requiredString(record, "obligationId"),
    assetAccountId: requiredString(record, "assetAccountId"),
    amount: positiveMoney(record, "amount"),
    occurredOn,
    idempotencyKey,
  };
}

export function parseRecurringCommitmentCommand(input: unknown): RecurringCommitmentCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const currency = requiredString(record, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RequestValidationError("currency must be an ISO 4217 code");
  }
  const frequency = record.frequency;
  if (!(frequency === "ONCE" || frequency === "WEEKLY" || frequency === "MONTHLY")) {
    throw new RequestValidationError("frequency is invalid");
  }
  const startsOn = requiredString(record, "startsOn");
  if (!DATE_PATTERN.test(startsOn)) {
    throw new RequestValidationError("startsOn must use YYYY-MM-DD");
  }
  const endsOn = record.endsOn;
  if (endsOn !== undefined && (typeof endsOn !== "string" || !DATE_PATTERN.test(endsOn))) {
    throw new RequestValidationError("endsOn must use YYYY-MM-DD");
  }
  if (typeof endsOn === "string" && endsOn < startsOn) {
    throw new RequestValidationError("endsOn must not precede startsOn");
  }
  const categoryId = record.categoryId;
  const expectedAccountId = record.expectedAccountId;
  for (const [field, value] of [["categoryId", categoryId], ["expectedAccountId", expectedAccountId]] as const) {
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
      throw new RequestValidationError(`${field} must be a non-empty string`);
    }
  }
  return {
    name: requiredString(record, "name"),
    expectedAmount: positiveMoney(record, "expectedAmount"),
    currency,
    frequency,
    startsOn,
    ...(typeof endsOn === "string" ? { endsOn } : {}),
    ...(typeof categoryId === "string" ? { categoryId: categoryId.trim() } : {}),
    ...(typeof expectedAccountId === "string" ? { expectedAccountId: expectedAccountId.trim() } : {}),
  };
}

export function parseCategoryRuleCommand(input: unknown): CategoryRuleCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const priority = record.priority ?? 0;
  if (!Number.isInteger(priority) || Number(priority) < -1000 || Number(priority) > 1000) {
    throw new RequestValidationError("priority must be an integer between -1000 and 1000");
  }
  return {
    pattern: requiredString(record, "pattern"),
    categoryId: requiredString(record, "categoryId"),
    priority: Number(priority),
  };
}

export function parseCategorizeStatementLineCommand(input: unknown): CategorizeStatementLineCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  if (typeof record.learnRule !== "boolean") {
    throw new RequestValidationError("learnRule must be boolean");
  }
  return {
    categoryId: requiredString(record, "categoryId"),
    learnRule: record.learnRule,
  };
}

export type QuickCaptureCommand = {
  kind: "INCOME" | "EXPENSE";
  amount: string;
  currency: string | null;
  merchant: string;
  card: string | null;
  accountId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  note: string | null;
  occurredOn: string;
  idempotencyKey: string;
};

const CURRENCY_PREFIXES: [RegExp, string][] = [
  [/^(A\$|AU\$|AUD)/i, "AUD"],
  [/^(US\$|U\$S|USD)/i, "USD"],
  [/^(AR\$|ARS)/i, "ARS"],
  [/^(€|EUR)/i, "EUR"],
  [/^(£|GBP)/i, "GBP"],
];
const CURRENCY_SUFFIXES: [RegExp, string][] = [
  [/(AUD|A\$)$/i, "AUD"],
  [/(USD|US\$)$/i, "USD"],
  [/ARS$/i, "ARS"],
  [/(EUR|€)$/i, "EUR"],
  [/(GBP|£)$/i, "GBP"],
];
const OCCURRED_AT_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/;

/**
 * Parses amounts as Wallet and Shortcuts send them ("A$12.50", "$1,234.50",
 * "12,50", "-12.50"). The sign is ignored: the kind decides the direction.
 */
export function parseWalletAmount(input: unknown) {
  if (typeof input === "number") input = String(input);
  if (typeof input !== "string" || !input.trim()) {
    throw new RequestValidationError("amount is required");
  }
  let text = input.replace(/\s+/g, "").replace(/^[-+−]/, "");
  let currency: string | null = null;
  for (const [pattern, code] of CURRENCY_PREFIXES) {
    if (pattern.test(text)) {
      currency = code;
      text = text.replace(pattern, "");
      break;
    }
  }
  if (!currency) {
    for (const [pattern, code] of CURRENCY_SUFFIXES) {
      if (pattern.test(text)) {
        currency = code;
        text = text.replace(pattern, "");
        break;
      }
    }
  }
  text = text.replace(/^[-+−]/, "").replace(/^\$/, "");

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = text.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    const decimals = text.length - lastComma - 1;
    normalized =
      decimals <= 2 && text.indexOf(",") === lastComma
        ? text.replace(",", ".")
        : text.split(",").join("");
  } else {
    normalized = text;
  }

  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    throw new RequestValidationError("amount must be a positive amount");
  }
  return { amount: Number(normalized).toFixed(2), currency };
}

function optionalString(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} must be a string`);
  }
  return value.trim() || null;
}

function uuidFromHash(value: string) {
  const hex = createHash("sha256").update(value).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function parseQuickCaptureCommand(input: unknown): QuickCaptureCommand {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RequestValidationError("Body must be an object");
  }
  const record = input as Record<string, unknown>;
  const kind = record.kind ?? "EXPENSE";
  if (kind !== "INCOME" && kind !== "EXPENSE") {
    throw new RequestValidationError("kind must be INCOME or EXPENSE");
  }

  const parsed = parseWalletAmount(record.amount);
  const explicitCurrency = optionalString(record, "currency")?.toUpperCase() ?? null;
  if (explicitCurrency && !/^[A-Z]{3}$/.test(explicitCurrency)) {
    throw new RequestValidationError("currency must be an ISO 4217 code");
  }

  const merchant = optionalString(record, "merchant");
  if (!merchant) throw new RequestValidationError("merchant is required");

  const card = optionalString(record, "card");
  const accountId = optionalString(record, "accountId");
  if (!card && !accountId) {
    throw new RequestValidationError("card or accountId is required");
  }

  const occurredAt = optionalString(record, "occurredAt");
  const occurredMatch = occurredAt ? OCCURRED_AT_PATTERN.exec(occurredAt) : null;
  if (!occurredMatch) {
    throw new RequestValidationError("occurredAt must use YYYY-MM-DD or YYYY-MM-DDTHH:mm");
  }

  const currency = explicitCurrency ?? parsed.currency;
  const explicitKey = optionalString(record, "idempotencyKey");
  if (explicitKey && !UUID_PATTERN.test(explicitKey)) {
    throw new RequestValidationError("idempotencyKey must be a UUID");
  }
  // Shortcuts cannot easily mint UUIDs; retries of the same capture within
  // the same minute collapse into one entry.
  const idempotencyKey =
    explicitKey ??
    uuidFromHash(
      [
        "quick-capture",
        kind,
        parsed.amount,
        currency ?? "",
        merchant.toUpperCase(),
        (card ?? accountId ?? "").toUpperCase(),
        `${occurredMatch[1]}T${occurredMatch[2] ?? ""}`,
      ].join("|")
    );

  return {
    kind,
    amount: parsed.amount,
    currency,
    merchant,
    card,
    accountId,
    categoryId: optionalString(record, "categoryId"),
    categoryName: optionalString(record, "categoryName"),
    note: optionalString(record, "note"),
    occurredOn: occurredMatch[1],
    idempotencyKey,
  };
}
