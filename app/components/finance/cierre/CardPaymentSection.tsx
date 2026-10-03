"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/app/components/finance/ux/format";
import { LedgerAccount, today } from "./shared";

type CardGroup = { id: string; name: string; accounts: LedgerAccount[] };
type PaymentRow = { amount: string; sourceAccountId: string };

const NATIVE_SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function cardGroups(accounts: LedgerAccount[]): CardGroup[] {
  const groups = new Map<string, CardGroup>();
  for (const account of accounts) {
    if (account.kind !== "LIABILITY" || account.group?.type !== "CARD" || !account.isActive) continue;
    const group = groups.get(account.group.id) ?? { id: account.group.id, name: account.group.name, accounts: [] };
    group.accounts.push(account);
    groups.set(group.id, group);
  }
  return [...groups.values()];
}

function normalizeAmount(raw: string): string | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !(Number(normalized) > 0)) return null;
  return Number(normalized).toFixed(2);
}

/** "Tarjetas" in Cierre: card debt per currency and "Pagar tarjeta". */
export function CardPaymentSection({ accounts, onPaid }: { accounts: LedgerAccount[]; onPaid: () => Promise<void> }) {
  const cards = cardGroups(accounts);
  const [paying, setPaying] = useState<CardGroup | null>(null);
  const [message, setMessage] = useState("");

  if (cards.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tarjetas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {message && <p role="status" className="rounded-md bg-muted p-3 text-sm">{message}</p>}
        {cards.map((card) => (
          <div key={card.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{card.name}</p>
              <p className="text-muted-foreground">
                {card.accounts.map((account) => `Debés ${formatMoney(account.balance, account.currency)}`).join(" · ")}
              </p>
            </div>
            <Button variant="outline" className="min-h-11" onClick={() => { setMessage(""); setPaying(card); }}>
              Pagar tarjeta
            </Button>
          </div>
        ))}
        <CardPaymentDialog
          card={paying}
          accounts={accounts}
          onClose={() => setPaying(null)}
          onPaid={async (text) => {
            setPaying(null);
            setMessage(text);
            await onPaid();
          }}
        />
      </CardContent>
    </Card>
  );
}

function CardPaymentDialog({
  card,
  accounts,
  onClose,
  onPaid,
}: {
  card: CardGroup | null;
  accounts: LedgerAccount[];
  onClose: () => void;
  onPaid: (message: string) => Promise<void>;
}) {
  const [date, setDate] = useState(today);
  const [paidInFull, setPaidInFull] = useState(true);
  const [closingOn, setClosingOn] = useState("");
  const [rows, setRows] = useState<Record<string, PaymentRow>>({});
  const [debts, setDebts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const firstAmountRef = useRef<HTMLInputElement>(null);

  const currencies = card?.accounts.map((account) => account.currency) ?? [];
  const sourcesFor = (currency: string) =>
    accounts.filter((account) => account.kind === "ASSET" && account.isActive && account.currency === currency);

  // Reset the form during render when another card opens, instead of an effect.
  const [trackedCardId, setTrackedCardId] = useState<string | null>(null);
  if ((card?.id ?? null) !== trackedCardId) {
    setTrackedCardId(card?.id ?? null);
    setDate(today());
    setPaidInFull(true);
    setClosingOn("");
    setDebts({});
    setFormError(null);
    setRows(Object.fromEntries(currencies.map((currency) => [currency, { amount: "", sourceAccountId: sourcesFor(currency)[0]?.id ?? "" }])));
  }

  async function loadDebts(nextClosingOn: string) {
    setDebts({});
    if (!card || !/^\d{4}-\d{2}-\d{2}$/.test(nextClosingOn)) return;
    const response = await fetch(`/api/finance/v1/card-payments?cardGroupId=${card.id}&closingOn=${nextClosingOn}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { currencies: { currency: string; debtAtClosing: string }[] };
    setDebts(Object.fromEntries(body.currencies.map((item) => [item.currency, item.debtAtClosing])));
  }

  function updateRow(currency: string, patch: Partial<PaymentRow>) {
    setRows((current) => ({ ...current, [currency]: { ...current[currency], ...patch } }));
  }

  async function handleSubmit() {
    if (!card || submitting) return;
    const payments = [];
    for (const currency of currencies) {
      const row = rows[currency];
      if (!row?.amount.trim()) continue;
      const amount = normalizeAmount(row.amount);
      if (!amount) {
        setFormError(`Ingresá un monto válido en ${currency}.`);
        return;
      }
      if (!row.sourceAccountId) {
        setFormError(`No tenés una cuenta en ${currency} para pagar.`);
        return;
      }
      payments.push({ currency, sourceAccountId: row.sourceAccountId, amount });
    }
    if (payments.length === 0) {
      setFormError("Ingresá cuánto pagaste.");
      return;
    }
    if (paidInFull && !closingOn) {
      setFormError("Ingresá la fecha de cierre del resumen.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch("/api/finance/v1/card-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardGroupId: card.id,
          occurredOn: date,
          ...(paidInFull ? { closingOn } : {}),
          payments,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(body?.error?.message ?? "No se pudo registrar el pago.");
        return;
      }
      const result = body as { payments: { currency: string; amount: string; difference: string | null }[] };
      await onPaid(
        `Pago registrado · ${result.payments
          .map((item) =>
            item.difference && Number(item.difference) !== 0
              ? `${formatMoney(item.amount, item.currency)} (diferencia ${formatMoney(item.difference, item.currency)})`
              : formatMoney(item.amount, item.currency)
          )
          .join(" · ")}`
      );
    } catch {
      setFormError("No se pudo conectar. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          // Focusing a <select> would pop its native menu on iOS.
          event.preventDefault();
          firstAmountRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Pagar tarjeta</DialogTitle>
          {card && <DialogDescription>{card.name}: lo que pagaste en cada moneda.</DialogDescription>}
        </DialogHeader>
        {card && (
          <div className="flex flex-col gap-4">
            {currencies.map((currency, index) => {
              const row = rows[currency];
              const sources = sourcesFor(currency);
              const amount = row ? normalizeAmount(row.amount) : null;
              const debt = debts[currency];
              const difference = paidInFull && amount && debt !== undefined ? Number(amount) - Number(debt) : null;
              return (
                <div key={currency} className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`card-payment-amount-${currency}`}>Pagado ({currency})</Label>
                      <Input
                        id={`card-payment-amount-${currency}`}
                        ref={index === 0 ? firstAmountRef : undefined}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="h-11"
                        value={row?.amount ?? ""}
                        onChange={(event) => updateRow(currency, { amount: event.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`card-payment-source-${currency}`}>Sale de</Label>
                      <select
                        id={`card-payment-source-${currency}`}
                        className={NATIVE_SELECT}
                        value={row?.sourceAccountId ?? ""}
                        disabled={sources.length === 0}
                        onChange={(event) => updateRow(currency, { sourceAccountId: event.target.value })}
                      >
                        {sources.length === 0 && <option value="">Sin cuentas en {currency}</option>}
                        {sources.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {paidInFull && debt !== undefined && (
                    <p className="text-xs text-muted-foreground">
                      Deuda al cierre {formatMoney(debt, currency)}
                      {difference !== null &&
                        (Math.abs(difference) < 0.005
                          ? " · sin diferencia"
                          : ` · diferencia ${formatMoney(difference, currency)} ${difference > 0 ? "(gasto)" : "(a favor)"}`)}
                    </p>
                  )}
                </div>
              );
            })}

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={paidInFull}
                onChange={(event) => setPaidInFull(event.target.checked)}
              />
              <span>
                Pagué el total del resumen
                <span className="block text-xs text-muted-foreground">
                  La diferencia contra lo registrado hasta el cierre se anota como gasto en &quot;Tarjeta: cambio y cargos&quot;.
                </span>
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              {paidInFull && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="card-payment-closing">Cierre</Label>
                  <Input
                    id="card-payment-closing"
                    type="date"
                    className="h-11"
                    value={closingOn}
                    onChange={(event) => {
                      setClosingOn(event.target.value);
                      loadDebts(event.target.value).catch(() => setDebts({}));
                    }}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-payment-date">Fecha de pago</Label>
                <Input
                  id="card-payment-date"
                  type="date"
                  className="h-11"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button type="button" size="lg" className="h-12 w-full text-base" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Guardando…" : "Registrar pago"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
