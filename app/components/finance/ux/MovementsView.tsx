"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CategorySheet } from "./CategorySheet";
import { dayLabel, formatMoney } from "./format";
import { MonthPicker } from "./MonthPicker";
import type { ApiError, MonthMovement } from "./types";
import { useMonth } from "./useMonth";

type Filter = "all" | "uncategorized" | "expense" | "income";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "uncategorized", label: "Sin categoría" },
  { key: "expense", label: "Gastos" },
  { key: "income", label: "Ingresos" },
];

function emptyMessage(filter: Filter, categoryParam: string | null) {
  if (categoryParam) return "No hay movimientos en esta categoría este mes.";
  if (filter === "uncategorized") return "No hay movimientos sin categoría este mes.";
  if (filter === "expense") return "No hay gastos este mes.";
  if (filter === "income") return "No hay ingresos este mes.";
  return "No hay movimientos este mes.";
}

function AmountDisplay({ movement }: { movement: MonthMovement }) {
  if (movement.kind === "TRANSFER" || movement.kind === "FX") {
    return (
      <span className="shrink-0 text-sm text-muted-foreground">→ {movement.destinationAccount?.name}</span>
    );
  }
  const isIncome = movement.kind === "INCOME";
  return (
    <span className={cn("shrink-0 text-sm font-medium", isIncome && "text-emerald-600 dark:text-emerald-400")}>
      {isIncome ? "+" : "−"}
      {formatMoney(movement.amount, movement.currency)}
    </span>
  );
}

function MovementRow({ movement, onSelect }: { movement: MonthMovement; onSelect: () => void }) {
  const clickable = movement.categorizable;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onSelect : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      className={cn(
        "flex min-h-11 items-start justify-between gap-3 px-3 py-3 text-left",
        clickable && "cursor-pointer hover:bg-muted/50 active:bg-muted"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{movement.description}</p>
        {movement.account && <p className="truncate text-xs text-muted-foreground">{movement.account.name}</p>}
        {(clickable || movement.status === "PROVISIONAL") && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {clickable && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  movement.category
                    ? "bg-muted text-foreground"
                    : "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                )}
              >
                {movement.category ? (
                  <>
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: movement.category.color }}
                    />
                    {movement.category.name}
                  </>
                ) : (
                  "Sin categoría"
                )}
              </span>
            )}
            {movement.status === "PROVISIONAL" && <Badge variant="outline">Pendiente resumen</Badge>}
          </div>
        )}
      </div>
      <AmountDisplay movement={movement} />
    </div>
  );
}

export function MovementsView() {
  const { month } = useMonth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filter, setFilter] = useState<Filter>(() =>
    searchParams.get("filter") === "uncategorized" ? "uncategorized" : "all"
  );
  const [movements, setMovements] = useState<MonthMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [activeMovement, setActiveMovement] = useState<MonthMovement | null>(null);

  // Reset stale data during render when the month changes, so the fetch effect below
  // never shows a previous month's movements under the new month header.
  const [trackedMonth, setTrackedMonth] = useState(month);
  if (trackedMonth !== month) {
    setTrackedMonth(month);
    setMovements(null);
    setError(null);
  }

  const load = useCallback(() => {
    fetch(`/api/finance/v1/monthly-movements?month=${month}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as ApiError | null;
          throw new Error(body?.error?.message ?? "No se pudieron cargar los movimientos");
        }
        setMovements((await res.json()) as MonthMovement[]);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los movimientos");
      });
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener("finance:changed", load);
    return () => window.removeEventListener("finance:changed", load);
  }, [load]);

  const categoryParam = searchParams.get("category");

  const filtered = useMemo(() => {
    if (!movements) return [];
    return movements.filter((movement) => {
      if (filter === "uncategorized" && !(movement.categorizable && !movement.category)) return false;
      if (filter === "expense" && movement.kind !== "EXPENSE") return false;
      if (filter === "income" && movement.kind !== "INCOME") return false;
      if (categoryParam === "uncategorized") {
        if (!(movement.categorizable && !movement.category)) return false;
      } else if (categoryParam && movement.category?.id !== categoryParam) {
        return false;
      }
      return true;
    });
  }, [movements, filter, categoryParam]);

  const groups = useMemo(() => {
    const map = new Map<string, MonthMovement[]>();
    for (const movement of filtered) {
      const list = map.get(movement.occurredOn);
      if (list) list.push(movement);
      else map.set(movement.occurredOn, [movement]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const summary = useMemo(() => {
    const totals = new Map<string, number>();
    for (const movement of filtered) {
      if (movement.kind !== "EXPENSE") continue;
      totals.set(movement.currency, (totals.get(movement.currency) ?? 0) + Number(movement.amount));
    }
    return { count: filtered.length, totals };
  }, [filtered]);

  const categoryChipLabel =
    categoryParam === "uncategorized"
      ? "Sin categoría"
      : (movements?.find((movement) => movement.category?.id === categoryParam)?.category?.name ?? "Categoría");

  function dismissCategoryFilter() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("category");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function handleCategorized(entryId: string, category: { id: string; name: string; color?: string }, learnRule: boolean) {
    const previous = movements;
    setMovements(
      (current) =>
        current?.map((movement) =>
          movement.id === entryId
            ? {
                ...movement,
                category: { id: category.id, name: category.name, color: category.color ?? movement.category?.color ?? "#6B7280" },
              }
            : movement
        ) ?? current
    );
    setActiveMovement(null);
    setPatchError(null);
    fetch(`/api/finance/v1/entries/${entryId}/category`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: category.id, learnRule }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as ApiError | null;
          throw new Error(body?.error?.message ?? "No se pudo actualizar la categoría");
        }
        window.dispatchEvent(new Event("finance:changed"));
      })
      .catch((err) => {
        setMovements(previous);
        setPatchError(err instanceof Error ? err.message : "No se pudo actualizar la categoría");
      });
  }

  return (
    <div className="flex flex-col gap-4">
      <MonthPicker />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
              filter === item.key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
        {categoryParam && (
          <button
            type="button"
            onClick={dismissCategoryFilter}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-foreground bg-foreground px-3.5 text-sm font-medium text-background"
          >
            {categoryChipLabel}
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {movements !== null && (
        <p className="text-sm text-muted-foreground">
          {summary.count} {summary.count === 1 ? "movimiento" : "movimientos"}
          {Array.from(summary.totals.entries()).map(([currency, total]) => (
            <span key={currency}> · {formatMoney(total, currency)}</span>
          ))}
        </p>
      )}

      {patchError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{patchError}</p>}

      {movements === null && !error && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      )}

      {movements === null && error && (
        <div className="flex flex-col items-start gap-2 py-6 text-sm">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}

      {movements !== null && groups.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage(filter, categoryParam)}</p>
      )}

      {movements !== null && groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map(([date, dayMovements]) => (
            <div key={date} className="flex flex-col gap-1">
              <p className="px-1 text-xs font-medium uppercase text-muted-foreground">{dayLabel(date)}</p>
              <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {dayMovements.map((movement) => (
                  <MovementRow
                    key={movement.id}
                    movement={movement}
                    onSelect={() => setActiveMovement(movement)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <CategorySheet
        movement={activeMovement}
        onClose={() => setActiveMovement(null)}
        onSelect={(category, learnRule) => activeMovement && handleCategorized(activeMovement.id, category, learnRule)}
      />
    </div>
  );
}
