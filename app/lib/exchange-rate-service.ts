import { Prisma } from "@/app/generated/prisma/client";
import type { ManualRateCommand } from "@/app/lib/finance-v1-contracts";
import { parseOpenExchangeRatesResponse } from "@/app/lib/finance-rates";
import { LedgerInvariantError, parseCivilDate } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

const RATE_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function normalizeCurrencies(currencies: string[]) {
  const quotes = [...new Set(currencies.filter((currency) => currency !== "USD"))];
  if (quotes.some((currency) => !CURRENCY_PATTERN.test(currency))) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_CURRENCY",
      "Exchange-rate currencies must use ISO 4217 codes"
    );
  }
  return quotes;
}

function civilToday(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function latestStoredRates(currencies: string[]) {
  const snapshots = await prisma.exchangeRateSnapshot.findMany({
    where: { baseCurrency: "USD", quoteCurrency: { in: currencies } },
    orderBy: [
      { quoteCurrency: "asc" },
      { appliedOn: "desc" },
      { isManualOverride: "desc" },
      { observedAt: "desc" },
    ],
  });
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    const quote = snapshot.quoteCurrency.trim();
    if (!latest.has(quote)) latest.set(quote, snapshot);
  }
  return latest;
}

async function refreshFromOpenExchangeRates(currencies: string[]) {
  const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
  if (!appId) return;

  const url = new URL("https://openexchangerates.org/api/latest.json");
  url.searchParams.set("symbols", currencies.join(","));
  const response = await fetch(url, {
    headers: { Authorization: `Token ${appId}` },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Exchange-rate provider request failed");

  const body = parseOpenExchangeRatesResponse(await response.json(), currencies);
  const observedAt = new Date(body.timestamp * 1000);
  const appliedOn = civilToday(observedAt);
  await prisma.exchangeRateSnapshot.createMany({
    data: currencies.map((quoteCurrency) => ({
      baseCurrency: "USD",
      quoteCurrency,
      rate: new Prisma.Decimal(String(body.rates[quoteCurrency]))
        .toDecimalPlaces(8)
        .toFixed(8),
      provider: "OPEN_EXCHANGE_RATES",
      observedAt,
      appliedOn,
      isManualOverride: false,
    })),
    skipDuplicates: true,
  });
}

export async function getCurrentUsdRates(currencies: string[], now = new Date()) {
  const quotes = normalizeCurrencies(currencies);
  if (quotes.length === 0) return new Map();

  let latest = await latestStoredRates(quotes);
  const needsRefresh = quotes.some((currency) => {
    const snapshot = latest.get(currency);
    return (
      !snapshot ||
      (!snapshot.isManualOverride &&
        now.getTime() - snapshot.observedAt.getTime() > RATE_MAX_AGE_MS)
    );
  });
  if (needsRefresh) {
    try {
      await refreshFromOpenExchangeRates(quotes);
      latest = await latestStoredRates(quotes);
    } catch (error) {
      console.error(
        "finance_fx_provider_failed",
        error instanceof Error ? error.name : "unknown"
      );
    }
  }

  return latest;
}

export async function resolveHistoricalUsdRate(
  quoteCurrency: string,
  appliedOn: string
) {
  if (quoteCurrency === "USD") return null;
  normalizeCurrencies([quoteCurrency]);
  const date = parseCivilDate(appliedOn);
  const oldest = new Date(date);
  oldest.setUTCDate(oldest.getUTCDate() - 7);

  return prisma.exchangeRateSnapshot.findFirst({
    where: {
      baseCurrency: "USD",
      quoteCurrency,
      appliedOn: { gte: oldest, lte: date },
    },
    orderBy: [
      { appliedOn: "desc" },
      { isManualOverride: "desc" },
      { observedAt: "desc" },
    ],
  });
}

export async function createManualUsdRate(input: ManualRateCommand) {
  return prisma.exchangeRateSnapshot.create({
    data: {
      baseCurrency: "USD",
      quoteCurrency: input.quoteCurrency,
      rate: input.rate,
      provider: "MANUAL",
      observedAt: new Date(),
      appliedOn: parseCivilDate(input.appliedOn),
      isManualOverride: true,
    },
  });
}

export async function getFinanceConfiguration() {
  return prisma.financeConfiguration.upsert({
    where: { id: "default" },
    create: { id: "default", baseCurrency: "USD" },
    update: {},
  });
}

export async function setFinanceBaseCurrency(baseCurrency: string) {
  if (!CURRENCY_PATTERN.test(baseCurrency)) {
    throw new LedgerInvariantError(
      "LEDGER_INVALID_CURRENCY",
      "Base currency must use an ISO 4217 code"
    );
  }
  return prisma.financeConfiguration.upsert({
    where: { id: "default" },
    create: { id: "default", baseCurrency },
    update: { baseCurrency },
  });
}
