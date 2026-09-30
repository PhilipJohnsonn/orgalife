"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "./format";
import type { ApiError, CaptureOptions, PersonWithBalances } from "./types";

export type SettleTarget = { person: PersonWithBalances; direction: "RECEIVED" | "PAID" };
type Account = CaptureOptions["accounts"][number];

const NATIVE_SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function normalizeAmount(raw: string): string | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !(Number(normalized) > 0)) return null;
  return Number(normalized).toFixed(2);
}

/** What is owed in each currency in this direction, as positive amounts. */
function owedBalances(target: SettleTarget) {
  const sign = target.direction === "RECEIVED" ? 1 : -1;
  return target.person.balances
    .filter((item) => sign * Number(item.balance) > 0)
    .map((item) => ({ currency: item.currency, owed: (sign * Number(item.balance)).toFixed(2) }));
}

/** "Me pagó" / "Le pagué": settles a person's balance toward 0 from one of your accounts. */
export function SettleDialog({
  target,
  accounts,
  onClose,
  onSettled,
}: {
  target: SettleTarget | null;
  accounts: Account[];
  onClose: () => void;
  onSettled: (message: string) => void;
}) {
  const [debtCurrency, setDebtCurrency] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const owed = target ? owedBalances(target) : [];

  function selectDebt(currency: string) {
    const owedAmount = owed.find((item) => item.currency === currency)?.owed ?? "";
    const sameCurrencyAccount = accounts.find((account) => account.currency === currency);
    setDebtCurrency(currency);
    setDebtAmount(owedAmount);
    setAmount(sameCurrencyAccount ? owedAmount : "");
    setAccountId((sameCurrencyAccount ?? accounts[0])?.id ?? "");
  }

  // Reset the form during render when a different person/direction opens, instead of an effect.
  const targetKey = target ? `${target.person.id}:${target.direction}` : null;
  const [trackedKey, setTrackedKey] = useState<string | null>(null);
  if (targetKey !== trackedKey) {
    setTrackedKey(targetKey);
    setFormError(null);
    setDate(todayLocal());
    if (owed[0]) selectDebt(owed[0].currency);
  }

  const accountCurrency = accounts.find((account) => account.id === accountId)?.currency ?? "";
  const crossCurrency = Boolean(accountCurrency) && accountCurrency !== debtCurrency;
  const received = target?.direction === "RECEIVED";

  async function handleSubmit() {
    if (!target || submitting) return;
    const normalizedAmount = normalizeAmount(amount);
    const normalizedDebt = crossCurrency ? normalizeAmount(debtAmount) : null;
    if (!accountId) {
      setFormError("Elegí una cuenta.");
      return;
    }
    if (!normalizedAmount || (crossCurrency && !normalizedDebt)) {
      setFormError("Ingresá un monto válido.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/finance/v1/people/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: target.person.id,
          direction: target.direction,
          accountId,
          amount: normalizedAmount,
          ...(crossCurrency ? { debt: { currency: debtCurrency, amount: normalizedDebt } } : {}),
          occurredOn: date,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = (await res.json().catch(() => null)) as ({ description?: string } & Partial<ApiError>) | null;
      if (!res.ok) {
        setFormError(body?.error?.message ?? "No se pudo registrar el pago.");
        return;
      }
      onSettled(`${body?.description ?? "Pago registrado"} · ${normalizedAmount} ${accountCurrency}`);
    } catch {
      setFormError("No se pudo conectar. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          // Focusing the first <select> would pop its native menu on iOS.
          event.preventDefault();
          amountRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{received ? "Me pagó" : "Le pagué"}</DialogTitle>
          {target && (
            <DialogDescription>
              {target.person.name}
              {owed.map((item) => ` · ${received ? "te debe" : "le debés"} ${formatMoney(item.owed, item.currency)}`)}
            </DialogDescription>
          )}
        </DialogHeader>
        {target && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settle-debt-currency">Deuda en</Label>
                <select
                  id="settle-debt-currency"
                  className={NATIVE_SELECT}
                  value={debtCurrency}
                  onChange={(event) => selectDebt(event.target.value)}
                >
                  {owed.map((item) => (
                    <option key={item.currency} value={item.currency}>
                      {item.currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settle-account">{received ? "Entra en" : "Sale de"}</Label>
                <select
                  id="settle-account"
                  className={NATIVE_SELECT}
                  value={accountId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setAccountId(id);
                    // Same currency as the debt: the owed amount is the natural default.
                    const currency = accounts.find((account) => account.id === id)?.currency;
                    setAmount(currency === debtCurrency ? debtAmount : "");
                  }}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settle-amount">Monto ({accountCurrency})</Label>
                <Input
                  id="settle-amount"
                  ref={amountRef}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="h-11"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
              {crossCurrency && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="settle-debt-amount">Cancela ({debtCurrency})</Label>
                  <Input
                    id="settle-debt-amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className="h-11"
                    value={debtAmount}
                    onChange={(event) => setDebtAmount(event.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="settle-date">Fecha</Label>
              <Input
                id="settle-date"
                type="date"
                className="h-11"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button
              type="button"
              size="lg"
              className="h-12 w-full text-base"
              disabled={submitting || accounts.length === 0}
              onClick={handleSubmit}
            >
              {submitting ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
