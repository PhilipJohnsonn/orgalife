export type Region = "ARGENTINA" | "AUSTRALIA" | "GLOBAL";

export type LedgerAccount = {
  id: string;
  name: string;
  currency: string;
  kind: string;
  trackingMode: string;
  isActive: boolean;
  balance: string;
  group: {
    id: string;
    name: string;
    region: Region;
    type: "BANK" | "WALLET" | "CARD" | "OTHER";
  } | null;
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
    cardDebt: ConsolidatedValue;
    net: ConsolidatedValue;
    afterCardDebt: ConsolidatedValue;
    flow: ConsolidatedValue;
  };
  native: {
    liquid: NativeValue[];
    cardDebt: NativeValue[];
    afterCardDebt: NativeValue[];
  };
  cardProjection: {
    byCurrency: {
      currency: string;
      available: string;
      cardDebt: string;
      shortfall: string;
      afterCardDebt: string;
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
