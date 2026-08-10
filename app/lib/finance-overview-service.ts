import { Decimal } from "@prisma/client/runtime/client";
import { convertUsdPivotAmount } from "@/app/lib/finance-rates";
import {
  getCurrentUsdRates,
  getFinanceConfiguration,
} from "@/app/lib/exchange-rate-service";
import { getNativeAccountBalances } from "@/app/lib/ledger-account-service";
import { parseCivilDate } from "@/app/lib/ledger";
import { prisma } from "@/app/lib/prisma";

export type FinanceRegion = "ARGENTINA" | "AUSTRALIA" | "GLOBAL";

function add(map: Map<string, Decimal>, currency: string, amount: string) {
  map.set(currency, (map.get(currency) ?? new Decimal(0)).add(amount));
}
function serialize(map: Map<string, Decimal>) {
  return [...map.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
}

function consolidate(
  amounts: Map<string, Decimal>,
  baseCurrency: string,
  rates: ReadonlyMap<string, string>
) {
  let total = new Decimal(0);
  const missingCurrencies: string[] = [];
  for (const [currency, amount] of amounts) {
    const converted = convertUsdPivotAmount(
      amount.toFixed(2),
      currency,
      baseCurrency,
      rates
    );
    if (converted === null) {
      missingCurrencies.push(currency);
    } else {
      total = total.add(converted);
    }
  }
  return {
    currency: baseCurrency,
    value: missingCurrencies.length === 0 ? total.toFixed(2) : null,
    partialValue: total.toFixed(2),
    incomplete: missingCurrencies.length > 0,
    missingCurrencies,
  };
}

function defaultPeriod(now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from, to };
}

export async function getFinanceOverview(input: {
  region: FinanceRegion;
  from?: string;
  to?: string;
}) {
  const configuration = await getFinanceConfiguration();
  const baseCurrency = configuration.baseCurrency.trim();
  const allAccounts = await getNativeAccountBalances();
  const accounts = allAccounts.filter(
    (account) =>
      input.region === "GLOBAL" || account.group?.region === input.region
  );
  const currencies = [...new Set([...accounts.map((account) => account.currency), baseCurrency])];
  const snapshots = await getCurrentUsdRates(currencies);
  const rates = new Map(
    [...snapshots.entries()].map(([currency, snapshot]) => [
      currency,
      snapshot.rate.toFixed(8),
    ])
  );

  const liquid = new Map<string, Decimal>();
  const confirmedNet = new Map<string, Decimal>();
  for (const account of accounts) {
    if (account.kind === "ASSET") add(liquid, account.currency, account.balance);
    const sign = ["LIABILITY", "PAYABLE"].includes(account.kind) ? -1 : 1;
    add(
      confirmedNet,
      account.currency,
      new Decimal(account.balance).mul(sign).toFixed(2)
    );
  }

  const fallbackPeriod = defaultPeriod();
  const from = input.from ? parseCivilDate(input.from) : fallbackPeriod.from;
  const to = input.to ? parseCivilDate(input.to) : fallbackPeriod.to;
  const flowEntries = await prisma.journalEntry.findMany({
    where: {
      operationType: { in: ["INCOME", "EXPENSE"] },
      status: "POSTED",
      occurredOn: { gte: from, lte: to },
    },
    include: {
      postings: {
        include: { ledgerAccount: { include: { accountGroup: true } } },
      },
    },
  });
  const flow = new Map<string, Decimal>();
  for (const entry of flowEntries) {
    const userPosting = entry.postings.find(
      (posting) => !posting.ledgerAccount.isSystem
    );
    if (
      !userPosting ||
      (input.region !== "GLOBAL" &&
        userPosting.ledgerAccount.accountGroup?.region !== input.region)
    ) {
      continue;
    }
    const currency = userPosting.ledgerAccount.currency.trim();
    add(
      flow,
      currency,
      userPosting.amount
        .mul(entry.operationType === "INCOME" ? 1 : -1)
        .toFixed(2)
    );
  }

  const now = new Date();
  return {
    region: input.region,
    baseCurrency,
    accounts,
    native: {
      liquid: serialize(liquid),
      confirmedNet: serialize(confirmedNet),
      projectedNet: serialize(confirmedNet),
      flow: serialize(flow),
    },
    consolidated: {
      liquid: consolidate(liquid, baseCurrency, rates),
      confirmedNet: consolidate(confirmedNet, baseCurrency, rates),
      projectedNet: consolidate(confirmedNet, baseCurrency, rates),
      flow: consolidate(flow, baseCurrency, rates),
    },
    period: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    },
    rates: [...snapshots.values()].map((snapshot) => ({
      id: snapshot.id,
      quoteCurrency: snapshot.quoteCurrency.trim(),
      rate: snapshot.rate.toFixed(8),
      provider: snapshot.provider,
      observedAt: snapshot.observedAt.toISOString(),
      appliedOn: snapshot.appliedOn.toISOString().slice(0, 10),
      isManualOverride: snapshot.isManualOverride,
      stale:
        !snapshot.isManualOverride &&
        now.getTime() - snapshot.observedAt.getTime() > 36 * 60 * 60 * 1000,
    })),
    declaredAccounts: accounts
      .filter((account) => account.trackingMode === "DECLARED")
      .map((account) => ({
        id: account.id,
        name: account.name,
        lastUpdatedOn: account.lastUpdatedOn,
        ageDays: account.lastUpdatedOn
          ? Math.floor(
              (now.getTime() - parseCivilDate(account.lastUpdatedOn).getTime()) /
                (24 * 60 * 60 * 1000)
            )
          : null,
      })),
  };
}
