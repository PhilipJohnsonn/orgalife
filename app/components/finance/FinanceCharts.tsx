"use client";

import { Transaction } from "./types";
import { usdValue } from "./BalanceSummary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const INCOME_COLOR = "#16a34a";
const EXPENSE_COLOR = "#ef4444";
const UNCATEGORIZED_COLOR = "#6B7280";
const MAX_CATEGORY_BARS = 8;

interface Props {
  transactions: Transaction[];
  exchangeRate: number;
}

function fmtUSD(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtCompact(n: number) {
  return new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
}

interface TooltipItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipItem[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 shadow-md text-xs space-y-1">
      <p className="text-muted-foreground">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="font-medium tabular-nums">{fmtUSD(Number(item.value))} USD</span>
          <span className="text-muted-foreground">{item.name}</span>
        </p>
      ))}
    </div>
  );
}

function UnconvertedNote({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="text-xs text-muted-foreground pt-2">
      {count} {count === 1 ? "transacción sin conversión" : "transacciones sin conversión"} a USD — no incluida{count === 1 ? "" : "s"}.
    </p>
  );
}

export function FinanceCharts({ transactions, exchangeRate }: Props) {
  // --- Ingresos vs gastos por mes (USD) ---
  const byMonth = new Map<string, { ingresos: number; gastos: number }>();
  let unconverted = 0;
  for (const t of transactions) {
    const usd = usdValue(t, exchangeRate);
    if (usd == null) {
      unconverted++;
      continue;
    }
    const key = t.date.slice(0, 7);
    let month = byMonth.get(key);
    if (!month) {
      month = { ingresos: 0, gastos: 0 };
      byMonth.set(key, month);
    }
    if (t.type === "INCOME") month.ingresos += usd;
    else month.gastos += usd;
  }

  // Rellenar meses vacíos entre el primero y el último para no mentir en el eje temporal
  const monthKeys = [...byMonth.keys()].sort();
  const monthData: { month: string; ingresos: number; gastos: number }[] = [];
  if (monthKeys.length > 0) {
    let [y, m] = monthKeys[0].split("-").map(Number);
    const last = monthKeys[monthKeys.length - 1];
    let key = monthKeys[0];
    while (key <= last) {
      const totals = byMonth.get(key) ?? { ingresos: 0, gastos: 0 };
      monthData.push({ month: monthLabel(key), ...totals });
      m++;
      if (m > 12) { m = 1; y++; }
      key = `${y}-${String(m).padStart(2, "0")}`;
    }
  }

  // --- Gastos por categoría (USD) ---
  const byCategory = new Map<string, { name: string; color: string; total: number }>();
  for (const t of transactions) {
    if (t.type !== "EXPENSE") continue;
    const usd = usdValue(t, exchangeRate);
    if (usd == null) continue;
    const id = t.categoryId ?? "none";
    let entry = byCategory.get(id);
    if (!entry) {
      entry = {
        name: t.category?.name ?? "Sin categoría",
        color: t.category?.color ?? UNCATEGORIZED_COLOR,
        total: 0,
      };
      byCategory.set(id, entry);
    }
    entry.total += usd;
  }

  const sorted = [...byCategory.values()].sort((a, b) => b.total - a.total);
  let categoryData = sorted;
  if (sorted.length > MAX_CATEGORY_BARS) {
    const head = sorted.slice(0, MAX_CATEGORY_BARS - 1);
    const tail = sorted.slice(MAX_CATEGORY_BARS - 1);
    categoryData = [
      ...head,
      { name: "Otras", color: UNCATEGORIZED_COLOR, total: tail.reduce((sum, c) => sum + c.total, 0) },
    ];
  }
  const totalExpenses = categoryData.reduce((sum, c) => sum + c.total, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ingresos vs Gastos (USD)</CardTitle>
        </CardHeader>
        <CardContent>
          {monthData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin datos en este rango.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={fmtCompact}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill={INCOME_COLOR} maxBarSize={24} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gastos" name="Gastos" fill={EXPENSE_COLOR} maxBarSize={24} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} /> Ingresos
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} /> Gastos
                </span>
              </div>
              <UnconvertedNote count={unconverted} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gastos por categoría (USD)</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin gastos en este rango.</p>
          ) : (
            <ResponsiveContainer width="100%" height={categoryData.length * 34 + 12}>
              <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const value = Number(payload[0].value);
                    const pct = totalExpenses > 0 ? Math.round((value / totalExpenses) * 100) : 0;
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 shadow-md text-xs">
                        <p className="text-muted-foreground">{label}</p>
                        <p className="font-medium tabular-nums">{fmtUSD(value)} USD · {pct}%</p>
                      </div>
                    );
                  }}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                />
                <Bar dataKey="total" maxBarSize={20} radius={[0, 4, 4, 0]}>
                  {categoryData.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                  <LabelList
                    dataKey="total"
                    position="right"
                    formatter={(v: React.ReactNode) => fmtUSD(Number(v))}
                    style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
