"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { currentMonth, formatMoney, percentChange } from "./format";
import { MonthPicker } from "./MonthPicker";
import { useMonth } from "./useMonth";
import type { ApiError, MonthlySummary } from "./types";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: MonthlySummary };

async function fetchSummary(month: string, signal?: AbortSignal): Promise<MonthlySummary> {
  const response = await fetch(`/api/finance/v1/monthly-summary?month=${month}`, {
    cache: "no-store",
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((body as ApiError | null)?.error?.message ?? "No se pudo cargar el resumen del mes.");
  }
  return body as MonthlySummary;
}

function monthName(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, index - 1, 1))
  );
}

/** Appends the month to a movimientos link, unless it's the current month (which is the default). */
function withMonth(href: string, month: string) {
  if (month === currentMonth()) return href;
  return `${href}${href.includes("?") ? "&" : "?"}month=${month}`;
}

function isEmptySummary(data: MonthlySummary) {
  return (
    Number(data.current.income.AUD) === 0 &&
    Number(data.current.expenses.AUD) === 0 &&
    data.categories.length === 0
  );
}

function Delta({ change, previousMonth }: { change: number | null; previousMonth: string }) {
  if (change === null) return null;
  if (change === 0) {
    return <span className="text-xs font-medium text-muted-foreground">→ 0% vs {monthName(previousMonth)}</span>;
  }
  const isUp = change > 0;
  return (
    <span className={cn("text-xs font-medium", isUp ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
      {isUp ? "▲" : "▼"} {Math.abs(change)}% vs {monthName(previousMonth)}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center text-sm">
        <p className="text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <p>Todavía no hay movimientos este mes.</p>
        <p>
          Los gastos van a aparecer acá automáticamente cuando pagués con Apple Pay (con el atajo configurado) o los
          cargués con el botón +.
        </p>
      </CardContent>
    </Card>
  );
}

function Headline({ data }: { data: MonthlySummary }) {
  const expensesChange = percentChange(data.current.expenses.AUD, data.previous.expenses.AUD);
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Gastos</span>
          <span className="text-2xl font-semibold tabular-nums">{formatMoney(data.current.expenses.AUD, "AUD")}</span>
          <span className="text-xs text-muted-foreground">~{formatMoney(data.current.expenses.USD, "USD")}</span>
          <Delta change={expensesChange} previousMonth={data.previousMonth} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Ingresos</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(data.current.income.AUD, "AUD")}</span>
            <span className="text-xs text-muted-foreground">~{formatMoney(data.current.income.USD, "USD")}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Neto</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(data.current.net.AUD, "AUD")}</span>
            <span className="text-xs text-muted-foreground">~{formatMoney(data.current.net.USD, "USD")}</span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UncategorizedBanner({ count, month }: { count: number; month: string }) {
  return (
    <Link
      href={withMonth("/finanzas/movimientos?filter=uncategorized", month)}
      className="flex items-center justify-between gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm hover:bg-muted"
    >
      <span>
        {count} sin categoría — revisar
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function CategoryList({ data, month }: { data: MonthlySummary; month: string }) {
  const sorted = [...data.categories].sort((a, b) => Number(b.total.AUD) - Number(a.total.AUD));
  const max = Math.max(...sorted.map((category) => Number(category.total.AUD)), 0);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Gastos por categoría</h2>
        <ul className="flex flex-col gap-3">
          {sorted.map((category) => {
            const amount = Number(category.total.AUD);
            const width = max > 0 ? (amount / max) * 100 : 0;
            const change = percentChange(category.total.AUD, category.previous.AUD);
            return (
              <li key={category.id ?? "uncategorized"}>
                <Link
                  href={withMonth(
                    `/finanzas/movimientos?category=${encodeURIComponent(category.id ?? "uncategorized")}`,
                    month
                  )}
                  className="-mx-1 flex flex-col gap-1 rounded-md px-1 py-1 hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{category.name}</span>
                    <span className="shrink-0 tabular-nums font-medium">{formatMoney(category.total.AUD, "AUD")}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full min-w-[2px] rounded-full", !category.color && "bg-foreground/30")}
                      style={{ width: `${width}%`, backgroundColor: category.color ?? undefined }}
                    />
                  </div>
                  <Delta change={change} previousMonth={data.previousMonth} />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function MissingRatesWarning({ missingRates }: { missingRates: string[] }) {
  return (
    <Link
      href="/finanzas/cierre"
      className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground hover:bg-muted/50"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Faltan cotizaciones para: {missingRates.join(", ")} — los totales están incompletos. Cargalas en Cierre.
      </span>
    </Link>
  );
}

export function MonthView() {
  const { month } = useMonth();
  const [state, setState] = useState<ViewState>({ status: "loading" });

  const load = useCallback(
    (signal?: AbortSignal) => {
      setState({ status: "loading" });
      fetchSummary(month, signal)
        .then((data) => setState({ status: "success", data }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "No se pudo cargar el resumen del mes.",
          });
        });
    },
    [month]
  );

  useEffect(() => {
    const controller = new AbortController();
    // Resets to the loading skeleton when the month changes; state is otherwise updated after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const handleChanged = () => load();
    window.addEventListener("finance:changed", handleChanged);
    return () => window.removeEventListener("finance:changed", handleChanged);
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <MonthPicker />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState message={state.message} onRetry={() => load()} />}
      {state.status === "success" &&
        (isEmptySummary(state.data) ? (
          <EmptyState />
        ) : (
          <>
            <Headline data={state.data} />
            {state.data.uncategorizedCount > 0 && (
              <UncategorizedBanner count={state.data.uncategorizedCount} month={month} />
            )}
            <CategoryList data={state.data} month={month} />
            {state.data.missingRates.length > 0 && <MissingRatesWarning missingRates={state.data.missingRates} />}
          </>
        ))}
    </div>
  );
}
