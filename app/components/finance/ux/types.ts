export type DisplayAmounts = { AUD: string; USD: string };
export type NativeAmount = { currency: string; amount: string };

export type PeriodTotals = {
  income: DisplayAmounts;
  expenses: DisplayAmounts;
  net: DisplayAmounts;
  native: { income: NativeAmount[]; expenses: NativeAmount[] };
};

/** GET /api/finance/v1/monthly-summary?month=YYYY-MM */
export type MonthlySummary = {
  month: string;
  previousMonth: string;
  currencies: ["AUD", "USD"];
  current: PeriodTotals;
  previous: PeriodTotals;
  categories: {
    id: string | null;
    name: string;
    color: string | null;
    total: DisplayAmounts;
    previous: DisplayAmounts;
    native: NativeAmount[];
  }[];
  uncategorizedCount: number;
  missingRates: string[];
};

/** GET /api/finance/v1/monthly-movements?month=YYYY-MM */
export type MonthMovement = {
  id: string;
  status: "POSTED" | "PROVISIONAL";
  occurredOn: string;
  description: string;
  kind: "INCOME" | "EXPENSE" | "TRANSFER" | "FX";
  amount: string;
  currency: string;
  account: { id: string; name: string } | null;
  destinationAccount: { id: string; name: string; amount: string; currency: string } | null;
  category: { id: string; name: string; color: string } | null;
  categorizable: boolean;
};

/** GET /api/finance/v1/quick-capture/options */
export type CaptureOptions = {
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string; currency: string; kind: "ASSET" | "LIABILITY" }[];
};

export type ApiError = { error: { code: string; message: string } };
