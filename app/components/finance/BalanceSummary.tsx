"use client";

import { Transaction } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  transactions: Transaction[];
  exchangeRate: number;
}

interface GroupTotals {
  accountName: string;
  accountColor: string | null;
  currency: string;
  income: number;
  expense: number;
}

function usdValue(t: Transaction, exchangeRate: number): number | null {
  if (t.amountUSD != null) return t.amountUSD;
  if (t.currency === "ARS" && exchangeRate > 0) return t.amount / exchangeRate;
  return null;
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function BalanceSummary({ transactions, exchangeRate }: Props) {
  const groups = new Map<string, GroupTotals>();
  let incomeUSD = 0;
  let expenseUSD = 0;
  let unconverted = 0;

  for (const t of transactions) {
    const accountName = t.account?.name ?? "Sin cuenta";
    const key = `${accountName}|${t.currency}`;
    let group = groups.get(key);
    if (!group) {
      group = { accountName, accountColor: t.account?.color ?? null, currency: t.currency, income: 0, expense: 0 };
      groups.set(key, group);
    }
    if (t.type === "INCOME") group.income += t.amount;
    else group.expense += t.amount;

    const usd = usdValue(t, exchangeRate);
    if (usd == null) {
      unconverted++;
    } else if (t.type === "INCOME") {
      incomeUSD += usd;
    } else {
      expenseUSD += usd;
    }
  }

  const rows = [...groups.values()].sort(
    (a, b) => a.accountName.localeCompare(b.accountName) || a.currency.localeCompare(b.currency)
  );
  const netUSD = incomeUSD - expenseUSD;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Balance</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">Sin movimientos en este rango.</p>
        ) : (
          <div className="space-y-1">
            <div className="hidden sm:grid grid-cols-[1fr_5rem_repeat(3,7rem)] gap-2 text-xs text-muted-foreground pb-1 border-b">
              <span>Cuenta</span>
              <span>Moneda</span>
              <span className="text-right">Ingresos</span>
              <span className="text-right">Gastos</span>
              <span className="text-right">Neto</span>
            </div>
            {rows.map((row) => {
              const net = row.income - row.expense;
              return (
                <div
                  key={`${row.accountName}|${row.currency}`}
                  className="grid grid-cols-2 sm:grid-cols-[1fr_5rem_repeat(3,7rem)] gap-2 text-sm py-1"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {row.accountColor && (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.accountColor }} />
                    )}
                    <span className="truncate">{row.accountName}</span>
                  </span>
                  <span className="text-muted-foreground text-right sm:text-left">{row.currency}</span>
                  <span className="hidden sm:block text-right tabular-nums text-green-600 dark:text-green-500">
                    {row.income > 0 ? `+${fmt(row.income)}` : "—"}
                  </span>
                  <span className="hidden sm:block text-right tabular-nums">
                    {row.expense > 0 ? `−${fmt(row.expense)}` : "—"}
                  </span>
                  <span className={`col-span-2 sm:col-span-1 text-right tabular-nums font-medium ${net < 0 ? "text-destructive" : ""}`}>
                    {net < 0 ? "−" : ""}{fmt(Math.abs(net))}
                  </span>
                </div>
              );
            })}
            <div className="grid grid-cols-2 sm:grid-cols-[1fr_5rem_repeat(3,7rem)] gap-2 text-sm pt-2 mt-1 border-t font-medium">
              <span>Total</span>
              <span className="text-muted-foreground text-right sm:text-left">USD</span>
              <span className="hidden sm:block text-right tabular-nums text-green-600 dark:text-green-500">
                +{fmt(incomeUSD)}
              </span>
              <span className="hidden sm:block text-right tabular-nums">−{fmt(expenseUSD)}</span>
              <span className={`col-span-2 sm:col-span-1 text-right tabular-nums ${netUSD < 0 ? "text-destructive" : ""}`}>
                {netUSD < 0 ? "−" : ""}{fmt(Math.abs(netUSD))}
              </span>
            </div>
            {unconverted > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                {unconverted} {unconverted === 1 ? "transacción sin conversión" : "transacciones sin conversión"} a USD (moneda sin TC) — no incluida{unconverted === 1 ? "" : "s"} en el total.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
