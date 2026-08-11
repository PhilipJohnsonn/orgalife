"use client";

import { LedgerFinance } from "./LedgerFinance";

export function FinancePage() {
  return (
    <div className="flex min-w-0 max-w-full flex-1 flex-col gap-4 overflow-x-hidden p-4">
      <h1 className="text-xl font-bold">Finanzas</h1>
      <LedgerFinance />
    </div>
  );
}
