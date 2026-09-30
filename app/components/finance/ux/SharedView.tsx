"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dayLabel, formatMoney } from "./format";
import { SettleDialog, type SettleTarget } from "./SettleDialog";
import type { ApiError, CaptureOptions, PeopleHistoryEntry, PersonWithBalances } from "./types";

type Data = {
  people: PersonWithBalances[];
  history: PeopleHistoryEntry[];
  accounts: CaptureOptions["accounts"];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error?.message ?? "No se pudieron cargar los compartidos");
  }
  return res.json() as Promise<T>;
}

function PersonCard({
  person,
  onSettle,
}: {
  person: PersonWithBalances;
  onSettle: (direction: SettleTarget["direction"]) => void;
}) {
  const owesYou = person.balances.some((item) => Number(item.balance) > 0);
  const youOwe = person.balances.some((item) => Number(item.balance) < 0);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="truncate text-sm font-medium">{person.name}</p>
        {person.balances.length > 1 && (
          <p className="shrink-0 text-xs text-muted-foreground">
            {person.netAud === null ? "Neto sin cotización" : `Neto ≈ ${formatMoney(person.netAud, "AUD")}`}
          </p>
        )}
      </div>
      {person.balances.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin saldo</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {person.balances.map((item) => {
            const positive = Number(item.balance) > 0;
            return (
              <li key={item.currency} className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{positive ? "Te debe" : "Le debés"}</span>
                <span className={cn("font-medium", positive && "text-emerald-600 dark:text-emerald-400")}>
                  {formatMoney(Math.abs(Number(item.balance)), item.currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {(owesYou || youOwe) && (
        <div className="grid grid-cols-2 gap-2">
          {owesYou && (
            <Button type="button" variant="outline" className="h-11" onClick={() => onSettle("RECEIVED")}>
              Me pagó
            </Button>
          )}
          {youOwe && (
            <Button type="button" variant="outline" className="h-11" onClick={() => onSettle("PAID")}>
              Le pagué
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: PeopleHistoryEntry }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{entry.description}</p>
        <p className="shrink-0 text-xs text-muted-foreground">{dayLabel(entry.occurredOn)}</p>
      </div>
      <ul className="flex flex-col gap-0.5">
        {entry.people.map((item) => (
          <li key={`${item.personId}:${item.currency}`} className="flex justify-between gap-3 text-xs">
            <span className="truncate text-muted-foreground">{item.name}</span>
            <span className={cn(Number(item.amount) > 0 && "text-emerald-600 dark:text-emerald-400")}>
              {Number(item.amount) > 0 ? "+" : "−"}
              {formatMoney(Math.abs(Number(item.amount)), item.currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SharedView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<SettleTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    Promise.all([
      getJson<PersonWithBalances[]>("/api/finance/v1/people/balances"),
      getJson<PeopleHistoryEntry[]>("/api/finance/v1/people/history"),
      getJson<CaptureOptions>("/api/finance/v1/quick-capture/options"),
    ])
      .then(([people, history, options]) => {
        // Settling only moves money in or out of your own accounts, never a card.
        setData({ people, history, accounts: options.accounts.filter((account) => account.kind === "ASSET") });
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los compartidos"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener("finance:changed", load);
    return () => window.removeEventListener("finance:changed", load);
  }, [load]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function handleSettled(message: string) {
    setTarget(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Compartidos</h1>

      {data === null && !error && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {data === null && error && (
        <div className="flex flex-col items-start gap-2 py-6 text-sm">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Reintentar
          </Button>
        </div>
      )}

      {data !== null && data.people.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay personas. Agregalas en{" "}
          <Link href="/finanzas/ajustes" className="font-medium text-foreground underline">
            Ajustes
          </Link>
          .
        </p>
      )}

      {data !== null && data.people.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase text-muted-foreground">Saldos</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.people.map((person) => (
              <PersonCard key={person.id} person={person} onSettle={(direction) => setTarget({ person, direction })} />
            ))}
          </div>
        </section>
      )}

      {data !== null && data.history.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium uppercase text-muted-foreground">Historial</h2>
          <p className="px-1 text-xs text-muted-foreground">+ suma a lo que te deben · − resta</p>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {data.history.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}

      <SettleDialog
        target={target}
        accounts={data?.accounts ?? []}
        onClose={() => setTarget(null)}
        onSettled={handleSettled}
      />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8">
          <div className="rounded-lg bg-foreground px-3 py-2 text-sm text-background shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}
