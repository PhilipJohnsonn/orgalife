export const ICBC_VISA_PARSER_VERSION = 1;

export type IcbcVisaParserErrorCode =
  | "ICBC_UNSUPPORTED_LAYOUT"
  | "ICBC_MISSING_EXCLUSION_KEY";

export class IcbcVisaParserError extends Error {
  readonly code: IcbcVisaParserErrorCode;

  constructor(code: IcbcVisaParserErrorCode, message: string) {
    super(message);
    this.name = "IcbcVisaParserError";
    this.code = code;
  }
}

export type IcbcVisaLayoutItem = {
  page: number;
  str: string;
  x: number;
  y: number;
};

export type TaxExclusionPreview = {
  key: string;
  amount: string;
  currency: string;
  status: "PENDING_CONFIRMATION" | "CONFIRMED_NOT_CHARGED";
  resolution: "CREDIT_LINE" | null;
};

type StatementLineClassification =
  | "PURCHASE"
  | "ELIGIBLE_USD_TAX"
  | "PAYABLE_TAX"
  | "INTEREST"
  | "FEE"
  | "PAYMENT_OR_CREDIT"
  | "PREVIOUS_BALANCE"
  | "INFORMATIONAL"
  | "UNKNOWN";

type PaymentTreatment =
  | "PAYABLE"
  | "EXCLUDED_FROM_PAYMENT"
  | "INFORMATIONAL"
  | "NEEDS_REVIEW";

export type IcbcVisaStatementLine = {
  sourceLine: string;
  purchaseOn: string | null;
  billedOn: string;
  description: string;
  classification: StatementLineClassification;
  paymentTreatment: PaymentTreatment;
  billedCurrency: "ARS" | "USD";
  billedAmount: string;
  originalCurrency: string | null;
  originalAmount: string | null;
  installmentInfo: string | null;
  resolvesTaxExclusion?: string;
};

type LayoutRow = {
  page: number;
  y: number;
  items: IcbcVisaLayoutItem[];
};

type ParsedMoney = { cents: number; negative: boolean };

const CURRENCY_CODES = new Set([
  "ARS", "USD", "EUR", "GBP", "THB", "JPY", "BRL", "CLP", "MXN",
  "UYU", "PEN", "COP", "CHF", "CAD", "AUD", "CNY", "IDR", "SGD",
  "HKD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "KRW",
]);

const MONTHS: Record<string, string> = {
  ene: "01",
  feb: "02",
  mar: "03",
  abr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dic: "12",
};

function normalizeText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function parseMoney(value: string): ParsedMoney | null {
  const compact = value.trim().replace(/^\$\s*/, "").replace(/^U\$[DS]\s*/, "");
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(-)?$/.exec(compact);
  if (!match) return null;
  const whole = Number(match[1].replaceAll(".", ""));
  const cents = whole * 100 + Number(match[2]);
  return { cents, negative: Boolean(match[3]) };
}

function formatMoney(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function parseLongDate(value: string) {
  const match = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  return `20${match[3]}-${month}-${String(Number(match[1])).padStart(2, "0")}`;
}

function parsePurchaseDate(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(value.trim());
  return match ? `20${match[3]}-${match[2]}-${match[1]}` : null;
}

function groupRows(items: IcbcVisaLayoutItem[]) {
  const rows: LayoutRow[] = [];
  const sorted = [...items].sort(
    (left, right) =>
      left.page - right.page || right.y - left.y || left.x - right.x
  );

  for (const item of sorted) {
    const last = rows.at(-1);
    if (!last || last.page !== item.page || Math.abs(last.y - item.y) > 3) {
      rows.push({ page: item.page, y: item.y, items: [item] });
      continue;
    }
    last.items.push(item);
  }

  return rows.map((row) => {
    const deduplicated: IcbcVisaLayoutItem[] = [];
    for (const item of row.items.sort((left, right) => left.x - right.x)) {
      const duplicate = deduplicated.some(
        (candidate) =>
          candidate.str === item.str && Math.abs(candidate.x - item.x) <= 3
      );
      if (!duplicate) deduplicated.push(item);
    }
    return { ...row, items: deduplicated };
  });
}

function rowDescription(row: LayoutRow) {
  return normalizeText(
    row.items
      .filter((item) => item.x >= 145 && item.x < 380)
      .filter((item) => !CURRENCY_CODES.has(item.str))
      .filter((item) => !/^\d+$/.test(item.str))
      .filter((item) => parseMoney(item.str) === null)
      .map((item) => item.str)
      .join(" ")
  );
}

function rowAmounts(row: LayoutRow) {
  const ars = row.items
    .filter((item) => item.x >= 380 && item.x < 500)
    .map((item) => parseMoney(item.str))
    .filter((amount): amount is ParsedMoney => amount !== null)
    .at(-1);
  const usd = row.items
    .filter((item) => item.x >= 500)
    .map((item) => parseMoney(item.str))
    .filter((amount): amount is ParsedMoney => amount !== null)
    .at(-1);
  return { ars, usd };
}

function originalAmount(row: LayoutRow) {
  const currencyItem = row.items.find(
    (item) => item.x >= 190 && item.x < 310 && CURRENCY_CODES.has(item.str)
  );
  if (!currencyItem) return null;
  const amountItem = row.items.find(
    (item) =>
      item.x > currencyItem.x && item.x < 380 && parseMoney(item.str) !== null
  );
  const amount = amountItem ? parseMoney(amountItem.str) : null;
  return amount
    ? { currency: currencyItem.str, amount: formatMoney(amount.cents) }
    : null;
}

function classify(description: string): {
  classification: StatementLineClassification;
  paymentTreatment: PaymentTreatment;
} {
  const upper = description.toUpperCase();
  if (upper === "SALDO ANTERIOR") {
    return { classification: "PREVIOUS_BALANCE", paymentTreatment: "INFORMATIONAL" };
  }
  if (upper.includes("DEV.IMP. RG 5617") || upper.startsWith("SU PAGO")) {
    return { classification: "PAYMENT_OR_CREDIT", paymentTreatment: "INFORMATIONAL" };
  }
  if (upper.includes("DB.RG 5617")) {
    return { classification: "ELIGIBLE_USD_TAX", paymentTreatment: "EXCLUDED_FROM_PAYMENT" };
  }
  if (upper.includes("IMPUESTO DE SELLOS")) {
    return { classification: "PAYABLE_TAX", paymentTreatment: "PAYABLE" };
  }
  if (/INTER[ÉE]S|CARGO FINANCIERO/.test(upper)) {
    return { classification: "INTEREST", paymentTreatment: "PAYABLE" };
  }
  if (/COMISI[ÓO]N|RECARGO/.test(upper)) {
    return { classification: "FEE", paymentTreatment: "PAYABLE" };
  }
  return { classification: "PURCHASE", paymentTreatment: "PAYABLE" };
}

function parseLines(rows: LayoutRow[], billedOn: string) {
  const lines: IcbcVisaStatementLine[] = [];
  const relevantPages = new Set<number>([1]);

  for (const row of rows) {
    const description = rowDescription(row);
    if (!description) continue;

    const purchaseDateItem = row.items.find(
      (item) => item.x < 90 && parsePurchaseDate(item.str) !== null
    );
    const isPreviousBalance = description === "SALDO ANTERIOR";
    const isKnownUndatedCharge =
      description.includes("IMPUESTO DE SELLOS") || description.includes("DB.RG 5617");
    const isPayment =
      description.includes("DEV.IMP. RG 5617") || description.startsWith("SU PAGO");

    if (!purchaseDateItem && !isPreviousBalance && !isKnownUndatedCharge) continue;
    if (purchaseDateItem && !isPayment && description.startsWith("SALDO")) continue;

    const amounts = rowAmounts(row);
    const classification = classify(description);
    const original = originalAmount(row);
    const installment = /C\.\s*\d+\/\d+/i.exec(description)?.[0]
      .replace(/\s+/g, "")
      .toUpperCase() ?? null;

    const addLine = (currency: "ARS" | "USD", amount: ParsedMoney) => {
      if (amount.cents === 0) return;
      const signedCents = amount.negative ? -amount.cents : amount.cents;
      lines.push({
        sourceLine: `p${row.page}:y${row.y}${isPreviousBalance ? `:${currency}` : ""}`,
        purchaseOn:
          classification.classification === "PURCHASE" && purchaseDateItem
            ? parsePurchaseDate(purchaseDateItem.str)
            : null,
        billedOn,
        description,
        ...classification,
        billedCurrency: currency,
        billedAmount: formatMoney(signedCents),
        originalCurrency:
          classification.classification === "PURCHASE" ? original?.currency ?? null : null,
        originalAmount:
          classification.classification === "PURCHASE" ? original?.amount ?? null : null,
        installmentInfo: installment,
      });
      relevantPages.add(row.page);
    };

    if (isPreviousBalance) {
      if (amounts.ars) addLine("ARS", amounts.ars);
      if (amounts.usd) addLine("USD", amounts.usd);
      continue;
    }

    if (amounts.usd && amounts.usd.cents > 0) {
      addLine("USD", amounts.usd);
    } else if (amounts.ars) {
      addLine("ARS", amounts.ars);
    }
  }

  return { lines, relevantPages };
}

function headerValue(rows: LayoutRow[], label: string) {
  const row = rows.find((candidate) =>
    candidate.items.some((item) => item.str === label)
  );
  if (!row) return null;
  return row.items.find((item) => item.x >= 500 && item.str !== label)?.str ?? null;
}

function reportedTotals(rows: LayoutRow[]) {
  const arsRow = rows.find((row) =>
    row.items.some((item) => item.str === "SALDO ACTUAL $")
  );
  const usdRow = rows.find((row) =>
    row.items.some((item) => item.str === "U$S") &&
    row.items.some((item) => item.x >= 500 && parseMoney(item.str) !== null)
  );
  const ars = arsRow
    ? arsRow.items.map((item) => parseMoney(item.str)).find((value) => value !== null)
    : null;
  const usd = usdRow
    ? usdRow.items.map((item) => parseMoney(item.str)).find((value) => value !== null)
    : null;
  return { ars, usd };
}

function totalForCurrency(
  currency: "ARS" | "USD",
  reportedTotal: number,
  lines: IcbcVisaStatementLine[]
) {
  const currencyLines = lines.filter((line) => line.billedCurrency === currency);
  const cents = (line: IcbcVisaStatementLine) => Math.round(Number(line.billedAmount) * 100);
  const previousBalance = currencyLines
    .filter((line) => line.classification === "PREVIOUS_BALANCE")
    .reduce((sum, line) => sum + cents(line), 0);
  const paymentsAndCredits = currencyLines
    .filter((line) => line.classification === "PAYMENT_OR_CREDIT")
    .reduce((sum, line) => sum + cents(line), 0);
  const newCharges = currencyLines
    .filter(
      (line) =>
        line.classification !== "PREVIOUS_BALANCE" &&
        line.classification !== "PAYMENT_OR_CREDIT" &&
        line.classification !== "INFORMATIONAL"
    )
    .reduce((sum, line) => sum + cents(line), 0);
  const eligibleExclusions = currencyLines
    .filter((line) => line.classification === "ELIGIBLE_USD_TAX")
    .reduce((sum, line) => sum + cents(line), 0);
  const residual = reportedTotal - previousBalance - paymentsAndCredits - newCharges;

  return {
    currency,
    previousBalance: formatMoney(previousBalance),
    paymentsAndCredits: formatMoney(paymentsAndCredits),
    newCharges: formatMoney(newCharges),
    reportedTotal: formatMoney(reportedTotal),
    eligibleExclusions: formatMoney(eligibleExclusions),
    payableTotal: formatMoney(reportedTotal - eligibleExclusions),
    residual: formatMoney(residual),
  };
}

export function parseIcbcVisaLayout(
  items: IcbcVisaLayoutItem[],
  options: {
    pendingTaxExclusions?: TaxExclusionPreview[];
    newTaxExclusionKeys?: string[];
  } = {}
) {
  const rows = groupRows(items);
  const closingOn = parseLongDate(headerValue(rows, "CIERRE ACTUAL") ?? "");
  const dueOn = parseLongDate(headerValue(rows, "VENCIMIENTO ACTUAL") ?? "");
  const reported = reportedTotals(rows);

  if (!closingOn || !dueOn || !reported.ars || !reported.usd) {
    throw new IcbcVisaParserError(
      "ICBC_UNSUPPORTED_LAYOUT",
      "The PDF does not match the supported ICBC Visa layout"
    );
  }

  const parsed = parseLines(rows, closingOn);
  const pending = (options.pendingTaxExclusions ?? []).map((exclusion) => ({
    ...exclusion,
  }));
  const creditLines = parsed.lines.filter(
    (line) =>
      line.classification === "PAYMENT_OR_CREDIT" &&
      line.description.includes("DEV.IMP. RG 5617")
  );

  for (const line of creditLines) {
    const match = pending.find(
      (exclusion) =>
        exclusion.status === "PENDING_CONFIRMATION" &&
        exclusion.currency === line.billedCurrency &&
        exclusion.amount === formatMoney(Math.abs(Math.round(Number(line.billedAmount) * 100)))
    );
    if (!match) continue;
    match.status = "CONFIRMED_NOT_CHARGED";
    match.resolution = "CREDIT_LINE";
    line.resolvesTaxExclusion = match.key;
  }

  const eligibleLines = parsed.lines.filter(
    (line) => line.classification === "ELIGIBLE_USD_TAX"
  );
  const newKeys = options.newTaxExclusionKeys ?? [];
  if (eligibleLines.length > newKeys.length) {
    throw new IcbcVisaParserError(
      "ICBC_MISSING_EXCLUSION_KEY",
      "A stable key is required for each eligible tax exclusion"
    );
  }
  const taxExclusions: TaxExclusionPreview[] = [
    ...pending,
    ...eligibleLines.map((line, index) => ({
      key: newKeys[index],
      amount: line.billedAmount,
      currency: line.billedCurrency,
      status: "PENDING_CONFIRMATION" as const,
      resolution: null,
    })),
  ];

  const totals = [
    totalForCurrency("ARS", reported.ars.cents, parsed.lines),
    totalForCurrency("USD", reported.usd.cents, parsed.lines),
  ];
  const ignoredPages = [...new Set(items.map((item) => item.page))]
    .filter((page) => !parsed.relevantPages.has(page))
    .sort((left, right) => left - right);

  return {
    parser: "ICBC_VISA",
    parserVersion: ICBC_VISA_PARSER_VERSION,
    statement: {
      closingOn,
      dueOn,
      totals,
      lines: parsed.lines,
      taxExclusions,
      ignoredPages,
      status: totals.every((total) => Math.abs(Number(total.residual)) <= 0.01)
        ? "BALANCED"
        : "NEEDS_REVIEW",
    },
  };
}
