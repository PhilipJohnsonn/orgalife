import { Decimal } from "@prisma/client/runtime/client";
import {
  FinanceCategoryError,
  categorizeStatementLine,
  normalizeMerchantPattern,
} from "@/app/lib/finance-category-service";
import {
  merchantFromDescription,
  monthRange,
  signedFlowAmount,
} from "@/app/lib/finance-month";
import { convertUsdPivotAmount } from "@/app/lib/finance-rates";
import {
  getCurrentUsdRates,
  resolveHistoricalUsdRate,
} from "@/app/lib/exchange-rate-service";
import { prisma } from "@/app/lib/prisma";

export const DISPLAY_CURRENCIES = ["AUD", "USD"] as const;
type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
type DisplayAmounts = Record<DisplayCurrency, string>;

const EXCLUDED_STATUSES = ["SUPERSEDED", "DISMISSED", "REVERSED"] as const;

export function parseMonth(month: string) {
  const range = monthRange(month);
  if (!range) {
    throw new FinanceCategoryError("INVALID_MONTH", 422, "month must use YYYY-MM");
  }
  return range;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

type FlowBucket = Map<string, Decimal>;

function addTo(bucket: FlowBucket, currency: string, amount: Decimal) {
  bucket.set(currency, (bucket.get(currency) ?? new Decimal(0)).add(amount));
}

async function usdRatesAt(currencies: string[], date: Date) {
  const quotes = [...new Set(currencies.filter((currency) => currency !== "USD"))];
  const today = new Date();
  const reference = date.getTime() > today.getTime() ? today : date;
  const rates = new Map<string, string>();
  const missing: string[] = [];
  for (const currency of quotes) {
    const snapshot = await resolveHistoricalUsdRate(currency, reference.toISOString().slice(0, 10));
    if (snapshot) rates.set(currency, snapshot.rate.toFixed(8));
    else missing.push(currency);
  }
  if (missing.length > 0) {
    const current = await getCurrentUsdRates(missing);
    for (const [currency, snapshot] of current) rates.set(currency, snapshot.rate.toFixed(8));
  }
  return rates;
}

export function toDisplay(
  bucket: FlowBucket,
  rates: ReadonlyMap<string, string>,
  missingRates: Set<string>
): DisplayAmounts {
  const result = {} as DisplayAmounts;
  for (const target of DISPLAY_CURRENCIES) {
    let total = new Decimal(0);
    for (const [currency, amount] of bucket) {
      const converted = convertUsdPivotAmount(amount.toFixed(2), currency, target, rates);
      if (converted === null) missingRates.add(currency);
      else total = total.add(converted);
    }
    result[target] = total.toFixed(2);
  }
  return result;
}

function nativeList(bucket: FlowBucket) {
  return [...bucket.entries()]
    .filter(([, amount]) => !amount.isZero())
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
}

export async function getMonthlySummary(month: string) {
  const { from, to, previousFrom, previousTo } = parseMonth(month);
  const postings = await prisma.posting.findMany({
    where: {
      ledgerAccount: { kind: { in: ["INCOME", "EXPENSE"] } },
      journalEntry: {
        occurredOn: { gte: previousFrom, lte: to },
        status: { notIn: [...EXCLUDED_STATUSES] },
        operationType: { not: "REVERSAL" },
      },
    },
    include: {
      ledgerAccount: { select: { kind: true, currency: true } },
      category: { select: { id: true, name: true, color: true } },
      journalEntry: { select: { id: true, occurredOn: true } },
    },
  });

  const periods = {
    current: { income: new Map() as FlowBucket, expenses: new Map() as FlowBucket },
    previous: { income: new Map() as FlowBucket, expenses: new Map() as FlowBucket },
  };
  const categories = new Map<
    string,
    {
      id: string | null;
      name: string;
      color: string | null;
      current: FlowBucket;
      previous: FlowBucket;
    }
  >();
  const uncategorizedEntries = new Set<string>();
  const currencies = new Set<string>();

  for (const posting of postings) {
    const kind = posting.ledgerAccount.kind as "INCOME" | "EXPENSE";
    const currency = posting.ledgerAccount.currency.trim();
    const amount = signedFlowAmount(kind, posting.side, posting.amount.toFixed(2));
    const period = posting.journalEntry.occurredOn.getTime() >= from.getTime() ? "current" : "previous";
    currencies.add(currency);
    addTo(kind === "INCOME" ? periods[period].income : periods[period].expenses, currency, amount);

    if (kind !== "EXPENSE") continue;
    if (!posting.category && period === "current") uncategorizedEntries.add(posting.journalEntry.id);
    const key = posting.category?.id ?? "uncategorized";
    const category = categories.get(key) ?? {
      id: posting.category?.id ?? null,
      name: posting.category?.name ?? "Sin categoría",
      color: posting.category?.color ?? null,
      current: new Map(),
      previous: new Map(),
    };
    addTo(category[period], currency, amount);
    categories.set(key, category);
  }

  const [currentRates, previousRates] = await Promise.all([
    usdRatesAt([...currencies, ...DISPLAY_CURRENCIES], to),
    usdRatesAt([...currencies, ...DISPLAY_CURRENCIES], previousTo),
  ]);
  const missingRates = new Set<string>();
  const totals = (period: "current" | "previous") => {
    const rates = period === "current" ? currentRates : previousRates;
    const income = toDisplay(periods[period].income, rates, missingRates);
    const expenses = toDisplay(periods[period].expenses, rates, missingRates);
    const net = {} as DisplayAmounts;
    for (const target of DISPLAY_CURRENCIES) {
      net[target] = new Decimal(income[target]).sub(expenses[target]).toFixed(2);
    }
    return {
      income,
      expenses,
      net,
      native: {
        income: nativeList(periods[period].income),
        expenses: nativeList(periods[period].expenses),
      },
    };
  };

  const categoryRows = [...categories.values()]
    .map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      total: toDisplay(category.current, currentRates, missingRates),
      previous: toDisplay(category.previous, previousRates, missingRates),
      native: nativeList(category.current),
    }))
    .filter((category) => category.native.length > 0 || Number(category.previous.AUD) !== 0)
    .sort((first, second) => Number(second.total.AUD) - Number(first.total.AUD));

  return {
    month: monthKey(from),
    previousMonth: monthKey(previousFrom),
    currencies: DISPLAY_CURRENCIES,
    current: totals("current"),
    previous: totals("previous"),
    categories: categoryRows,
    uncategorizedCount: uncategorizedEntries.size,
    missingRates: [...missingRates].sort(),
  };
}

export async function listMonthMovements(month: string) {
  const { from, to } = parseMonth(month);
  const entries = await prisma.journalEntry.findMany({
    where: {
      occurredOn: { gte: from, lte: to },
      status: { notIn: [...EXCLUDED_STATUSES] },
      operationType: { in: ["INCOME", "EXPENSE", "CARD_PURCHASE", "TRANSFER", "FX"] },
    },
    include: {
      postings: {
        include: {
          ledgerAccount: { select: { id: true, name: true, kind: true, currency: true, isSystem: true } },
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
  });

  return entries.map((entry) => {
    const flowPosting = entry.postings.find((posting) =>
      ["INCOME", "EXPENSE"].includes(posting.ledgerAccount.kind)
    );
    const userPostings = entry.postings.filter((posting) => !posting.ledgerAccount.isSystem);
    const base = {
      id: entry.id,
      status: entry.status,
      occurredOn: entry.occurredOn.toISOString().slice(0, 10),
      description: entry.description,
    };
    if (flowPosting) {
      const userPosting = userPostings[0];
      return {
        ...base,
        kind: flowPosting.ledgerAccount.kind as "INCOME" | "EXPENSE",
        amount: flowPosting.amount.toFixed(2),
        currency: flowPosting.ledgerAccount.currency.trim(),
        account: userPosting ? { id: userPosting.ledgerAccount.id, name: userPosting.ledgerAccount.name } : null,
        destinationAccount: null,
        category: flowPosting.category,
        categorizable: true,
      };
    }
    const source = userPostings.find((posting) => posting.side === "CREDIT");
    const destination = userPostings.find((posting) => posting.side === "DEBIT");
    return {
      ...base,
      kind: entry.operationType as "TRANSFER" | "FX",
      amount: (source ?? destination)?.amount.toFixed(2) ?? "0.00",
      currency: (source ?? destination)?.ledgerAccount.currency.trim() ?? "",
      account: source ? { id: source.ledgerAccount.id, name: source.ledgerAccount.name } : null,
      destinationAccount: destination
        ? {
            id: destination.ledgerAccount.id,
            name: destination.ledgerAccount.name,
            amount: destination.amount.toFixed(2),
            currency: destination.ledgerAccount.currency.trim(),
          }
        : null,
      category: null,
      categorizable: false,
    };
  });
}

export async function setEntryCategory(
  entryId: string,
  command: { categoryId: string; learnRule: boolean }
) {
  const [entry, category] = await Promise.all([
    prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { postings: { include: { ledgerAccount: true } } },
    }),
    prisma.category.findUnique({ where: { id: command.categoryId } }),
  ]);
  if (!entry) throw new FinanceCategoryError("ENTRY_NOT_FOUND", 404, "Movimiento no encontrado");
  if (!category) throw new FinanceCategoryError("CATEGORY_NOT_FOUND", 404, "Category not found");
  if ((EXCLUDED_STATUSES as readonly string[]).includes(entry.status)) {
    throw new FinanceCategoryError("ENTRY_NOT_EDITABLE", 409, "Este movimiento ya no está vigente");
  }
  const flowPostings = entry.postings.filter((posting) =>
    ["INCOME", "EXPENSE"].includes(posting.ledgerAccount.kind)
  );
  if (flowPostings.length === 0) {
    throw new FinanceCategoryError("ENTRY_NOT_CATEGORIZABLE", 422, "Este movimiento no lleva categoría");
  }

  // Statement lines own their category; keep them in sync through the existing flow.
  const statementLineId = flowPostings.find((posting) => posting.statementLineId)?.statementLineId;
  if (statementLineId) {
    await categorizeStatementLine(statementLineId, command);
    return { entryId, category };
  }

  await prisma.$transaction(async (transaction) => {
    for (const posting of flowPostings) {
      if (posting.categoryId === category.id) continue;
      await transaction.posting.update({
        where: { id: posting.id },
        data: { categoryId: category.id },
      });
      await transaction.journalEntryAudit.create({
        data: {
          journalEntryId: entry.id,
          field: "CATEGORY",
          previousValue: posting.categoryId,
          newValue: category.id,
        },
      });
    }
    if (command.learnRule) {
      const patternNormalized = normalizeMerchantPattern(merchantFromDescription(entry.description));
      if (patternNormalized) {
        await transaction.categoryRule.updateMany({
          where: { patternNormalized, categoryId: { not: category.id } },
          data: { isActive: false },
        });
        await transaction.categoryRule.upsert({
          where: { patternNormalized_categoryId: { patternNormalized, categoryId: category.id } },
          create: { patternNormalized, categoryId: category.id },
          update: { isActive: true, lastUsedAt: new Date() },
        });
      }
    }
  });
  return { entryId, category };
}
