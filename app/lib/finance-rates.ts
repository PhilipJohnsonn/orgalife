import { Decimal } from "@prisma/client/runtime/client";

export type OpenExchangeRatesResponse = {
  base: "USD";
  timestamp: number;
  rates: Record<string, number>;
};

export function parseOpenExchangeRatesResponse(
  input: unknown,
  currencies: string[]
): OpenExchangeRatesResponse {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid provider response");
  }
  const record = input as Record<string, unknown>;
  if (
    record.base !== "USD" ||
    typeof record.timestamp !== "number" ||
    !record.rates ||
    typeof record.rates !== "object" ||
    Array.isArray(record.rates)
  ) {
    throw new Error("Invalid provider response");
  }
  const rates = record.rates as Record<string, unknown>;
  const normalized: Record<string, number> = {};
  for (const currency of currencies) {
    const rate = rates[currency];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("Provider response is missing a requested rate");
    }
    normalized[currency] = rate;
  }
  return { base: "USD", timestamp: record.timestamp, rates: normalized };
}

export function convertUsdPivotAmount(
  amount: string,
  sourceCurrency: string,
  destinationCurrency: string,
  usdQuoteRates: ReadonlyMap<string, string>
) {
  const value = new Decimal(amount);
  if (sourceCurrency === destinationCurrency) return value.toFixed(2);

  const sourceRate =
    sourceCurrency === "USD" ? new Decimal(1) : usdQuoteRates.get(sourceCurrency);
  const destinationRate =
    destinationCurrency === "USD"
      ? new Decimal(1)
      : usdQuoteRates.get(destinationCurrency);
  if (!sourceRate || !destinationRate) return null;

  return value
    .div(sourceRate)
    .mul(destinationRate)
    .toDecimalPlaces(2)
    .toFixed(2);
}
