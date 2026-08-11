import { Decimal } from "@prisma/client/runtime/client";

export function calculateCardProjection(input: {
  liquid: ReadonlyMap<string, Decimal>;
  billedDebt: ReadonlyMap<string, Decimal>;
  unbilled: ReadonlyMap<string, Decimal>;
  rates: ReadonlyMap<string, string>;
}) {
  const currencies = [...new Set([
    ...input.liquid.keys(),
    ...input.billedDebt.keys(),
    ...input.unbilled.keys(),
  ])].sort();
  const byCurrency = currencies.map((currency) => {
    const available = input.liquid.get(currency) ?? new Decimal(0);
    const billedDebt = input.billedDebt.get(currency) ?? new Decimal(0);
    const unbilled = input.unbilled.get(currency) ?? new Decimal(0);
    const afterBilled = available.minus(billedDebt);
    const afterAll = afterBilled.minus(unbilled);
    return {
      currency,
      available: available.toFixed(2),
      billedDebt: billedDebt.toFixed(2),
      unbilled: unbilled.toFixed(2),
      billedShortfall: Decimal.max(billedDebt.minus(available), 0).toFixed(2),
      afterBilled: afterBilled.toFixed(2),
      afterAll: afterAll.toFixed(2),
    };
  });
  const usdShortfall = byCurrency.find((item) => item.currency === "USD")?.billedShortfall ?? "0.00";
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
