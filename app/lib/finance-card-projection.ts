import { Decimal } from "@prisma/client/runtime/client";

export function calculateCardProjection(input: {
  liquid: ReadonlyMap<string, Decimal>;
  cardDebt: ReadonlyMap<string, Decimal>;
  rates: ReadonlyMap<string, string>;
}) {
  const currencies = [...new Set([
    ...input.liquid.keys(),
    ...input.cardDebt.keys(),
  ])].sort();
  const byCurrency = currencies.map((currency) => {
    const available = input.liquid.get(currency) ?? new Decimal(0);
    const cardDebt = input.cardDebt.get(currency) ?? new Decimal(0);
    return {
      currency,
      available: available.toFixed(2),
      cardDebt: cardDebt.toFixed(2),
      shortfall: Decimal.max(cardDebt.minus(available), 0).toFixed(2),
      afterCardDebt: available.minus(cardDebt).toFixed(2),
    };
  });
  const usdShortfall = byCurrency.find((item) => item.currency === "USD")?.shortfall ?? "0.00";
  const arsRate = input.rates.get("ARS") ?? null;
  return {
    byCurrency,
    usdPurchase: {
      shortfallUsd: usdShortfall,
      arsRequired: arsRate
        ? new Decimal(usdShortfall).mul(arsRate).toDecimalPlaces(2).toFixed(2)
        : null,
      rateArsPerUsd: arsRate,
    },
  };
}
