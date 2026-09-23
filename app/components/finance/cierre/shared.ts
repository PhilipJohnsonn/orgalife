export type Region = "ARGENTINA" | "AUSTRALIA" | "GLOBAL";

export type LedgerAccount = {
  id: string;
  name: string;
  currency: string;
  kind: string;
  trackingMode: string;
  balance: string;
  group: {
    id: string;
    name: string;
    region: Region;
    type: "BANK" | "WALLET" | "CARD" | "OTHER";
  } | null;
};

export type CardStatement = {
  id: string;
  cardGroup: { id: string; name: string; region: string };
  closingOn: string;
  dueOn: string;
  revision: number;
  status: "DRAFT" | "CONFIRMED" | "REVERSED";
  totals: {
    currency: string;
    reportedTotal: string;
    eligibleExclusions: string;
    payableTotal: string;
    paidTotal: string;
    pendingTotal: string;
    residual: string;
  }[];
  lines: {
    id: string;
    purchaseOn: string | null;
    description: string;
    classification: string;
    paymentTreatment: string;
    billedCurrency: string;
    billedAmount: string;
    originalCurrency: string | null;
    originalAmount: string | null;
    category: { id: string; name: string } | null;
  }[];
};

export type CardProvisional = {
  id: string;
  status: "PROVISIONAL" | "SUPERSEDED" | "DISMISSED";
  occurredOn: string;
  description: string;
  amount: string;
  currency: string;
  cardGroup: { id: string; name: string } | null;
};

export type CardPaymentState = {
  statementId: string;
  currencies: { currency: string; payable: string; pending: string }[];
  unassignedPayments: {
    journalEntryId: string;
    occurredOn: string;
    currency: string;
    available: string;
    sourceAccount: { id: string; name: string } | null;
  }[];
};

export type MovementAccount = {
  id: string;
  name: string;
  currency: string;
  amount: string;
  region: Region;
};

export type LedgerMovement = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "FX";
  occurredOn: string;
  description: string;
  source: MovementAccount | null;
  destination: MovementAccount | null;
  effectiveRate: string | null;
};

export type NativeValue = { currency: string; amount: string };

export type ConsolidatedValue = {
  currency: string;
  value: string | null;
  incomplete: boolean;
  missingCurrencies: string[];
};

export type Overview = {
  baseCurrency: string;
  consolidated: {
    liquid: ConsolidatedValue;
    billedCardDebt: ConsolidatedValue;
    unbilledCardDebt: ConsolidatedValue;
    confirmedNet: ConsolidatedValue;
    projectedNet: ConsolidatedValue;
    afterBilled: ConsolidatedValue;
    afterAll: ConsolidatedValue;
    flow: ConsolidatedValue;
  };
  native: {
    liquid: NativeValue[];
    billedCardDebt: NativeValue[];
    unbilledCardDebt: NativeValue[];
    afterBilled: NativeValue[];
    afterAll: NativeValue[];
  };
  cardProjection: {
    byCurrency: {
      currency: string;
      available: string;
      billedDebt: string;
      unbilled: string;
      billedShortfall: string;
      afterBilled: string;
      afterAll: string;
    }[];
    usdPurchase: {
      shortfallUsd: string;
      arsRequired: string | null;
      rateArsPerUsd: string | null;
    };
  };
  rates: {
    quoteCurrency: string;
    rate: string;
    provider: string;
    stale: boolean;
    isManualOverride: boolean;
  }[];
};

export function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function selectClass() {
  return "h-9 w-full rounded-md border bg-background px-3 text-sm";
}

export function valueLabel(value: ConsolidatedValue) {
  return value.value === null
    ? `Incompleto (${value.missingCurrencies.join(", ")})`
    : `${value.value} ${value.currency}`;
}

export function nativeLabel(values: NativeValue[]) {
  return values.map((item) => `${item.amount} ${item.currency}`).join(" · ") || "Sin saldos";
}

export async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    throw new Error(responseBody?.error?.message ?? "No se pudo guardar");
  }
}

export async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? "No se pudo guardar");
  return body;
}
