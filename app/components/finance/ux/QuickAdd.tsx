"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ApiError, CaptureOptions } from "./types";

type Mode = "EXPENSE" | "INCOME" | "TRANSFER";

const QUICK_ADD_ROUTES = ["/finanzas/mes", "/finanzas/movimientos"];
const CURRENCIES = ["AUD", "USD", "ARS"] as const;
const NO_CATEGORY = "none";
const LAST_ACCOUNT_KEY = "finance-quick-add:last-account";
const NATIVE_SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function todayLocal() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function nowLocalTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function normalizeAmount(raw: string): string | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!(value > 0)) return null;
  return value.toFixed(2);
}

function accountsForMode(options: CaptureOptions, mode: Mode) {
  if (mode === "EXPENSE") return options.accounts;
  return options.accounts.filter((account) => account.kind === "ASSET");
}

function destinationAccounts(options: CaptureOptions, sourceAccountId: string) {
  const source = options.accounts.find((account) => account.id === sourceAccountId);
  if (!source) return [];
  return options.accounts.filter(
    (account) => account.kind === "ASSET" && account.id !== sourceAccountId
  );
}

function readLastAccountId(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function writeLastAccountId(id: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    // Private mode or disabled storage — remembering the account is a convenience, not a requirement.
  }
}

export function QuickAdd() {
  const pathname = usePathname();
  const showFab = QUICK_ADD_ROUTES.includes(pathname);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("EXPENSE");

  const [options, setOptions] = useState<CaptureOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [accountId, setAccountId] = useState("");
  const [currency, setCurrency] = useState<string>(CURRENCIES[0]);
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [date, setDate] = useState(() => todayLocal());
  const [note, setNote] = useState("");

  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [destinationAmount, setDestinationAmount] = useState("");
  const [transferDescription, setTransferDescription] = useState("Transferencia");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || options || optionsLoading) return;
    // The loader updates state only after its network request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptionsLoading(true);
    setOptionsError(null);
    fetch("/api/finance/v1/quick-capture/options", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("load_failed");
        return res.json() as Promise<CaptureOptions>;
      })
      .then((data) => setOptions(data))
      .catch(() => setOptionsError("No se pudieron cargar las cuentas. Intentá de nuevo."))
      .finally(() => setOptionsLoading(false));
  }, [open, options, optionsLoading]);

  useEffect(() => {
    if (!options) return;
    if (mode === "TRANSFER") {
      const list = accountsForMode(options, mode);
      // Resets the selection to a still-valid account when the mode/options change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourceAccountId((current) => (list.some((a) => a.id === current) ? current : (list[0]?.id ?? "")));
      return;
    }
    const list = accountsForMode(options, mode);
    if (list.some((a) => a.id === accountId)) return;
    const last = readLastAccountId();
    const preferred = list.find((a) => a.id === last) ?? list[0];
    setAccountId(preferred?.id ?? "");
    if (preferred) setCurrency(preferred.currency);
  }, [options, mode, accountId]);

  useEffect(() => {
    if (!options || mode !== "TRANSFER") return;
    const list = destinationAccounts(options, sourceAccountId);
    // Resets the selection to a still-valid account when the source changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDestinationAccountId((current) => (list.some((a) => a.id === current) ? current : (list[0]?.id ?? "")));
  }, [options, mode, sourceAccountId]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  if (!showFab) return null;

  const sourceCurrency = options?.accounts.find((a) => a.id === sourceAccountId)?.currency ?? "";
  const destinationCurrency = options?.accounts.find((a) => a.id === destinationAccountId)?.currency ?? "";
  const isFx = mode === "TRANSFER" && Boolean(destinationCurrency) && destinationCurrency !== sourceCurrency;
  const fxSourceAmount = Number(amount.replace(",", "."));
  const fxDestinationAmount = Number(destinationAmount.replace(",", "."));
  const fxHint =
    isFx && fxSourceAmount > 0 && fxDestinationAmount > 0
      ? `1 ${sourceCurrency} = ${(fxDestinationAmount / fxSourceAmount).toFixed(4)} ${destinationCurrency}`
      : null;

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    setFormError(null);
    if (next) setDate(todayLocal());
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !options) return;
    setFormError(null);

    const normalizedAmount = normalizeAmount(amount);
    if (!normalizedAmount) {
      setFormError("Ingresá un monto válido.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "TRANSFER") {
        if (!sourceAccountId || !destinationAccountId) {
          setFormError("Elegí las dos cuentas.");
          return;
        }
        const normalizedDestinationAmount = isFx ? normalizeAmount(destinationAmount) : null;
        if (isFx && !normalizedDestinationAmount) {
          setFormError(`Ingresá cuánto llega en ${destinationCurrency}.`);
          return;
        }
        const movement = {
          sourceAccountId,
          destinationAccountId,
          occurredOn: date,
          description: transferDescription.trim() || "Transferencia",
          idempotencyKey: crypto.randomUUID(),
        };
        // Cross-currency transfers go through FX so each side keeps its own amount.
        const res = await fetch(isFx ? "/api/finance/v1/fx" : "/api/finance/v1/transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isFx
              ? { ...movement, sourceAmount: normalizedAmount, destinationAmount: normalizedDestinationAmount }
              : { ...movement, amount: normalizedAmount }
          ),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setFormError((data as ApiError | null)?.error?.message ?? "No se pudo registrar la transferencia.");
          return;
        }
        showToast(
          isFx
            ? `Transferencia registrada · ${normalizedAmount} ${sourceCurrency} → ${normalizedDestinationAmount} ${destinationCurrency}`
            : `Transferencia registrada · ${normalizedAmount} ${sourceCurrency}`.trim()
        );
        setAmount("");
        setDestinationAmount("");
        setTransferDescription("Transferencia");
      } else {
        if (!merchant.trim()) {
          setFormError("Escribí una descripción.");
          return;
        }
        if (!accountId) {
          setFormError("Elegí una cuenta.");
          return;
        }
        const res = await fetch("/api/finance/v1/quick-capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: mode,
            amount: normalizedAmount,
            currency,
            merchant: merchant.trim(),
            accountId,
            ...(categoryId !== NO_CATEGORY ? { categoryId } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            occurredAt: `${date}T${nowLocalTime()}`,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setFormError((data as ApiError | null)?.error?.message ?? "No se pudo guardar el movimiento.");
          return;
        }
        writeLastAccountId(accountId);
        showToast((data as { message?: string } | null)?.message ?? "Movimiento guardado.");
        setAmount("");
        setMerchant("");
      }

      setOpen(false);
      window.dispatchEvent(new Event("finance:changed"));
    } catch {
      setFormError("No se pudo conectar. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            aria-label="Agregar movimiento"
            className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg md:right-6 md:bottom-6"
          >
            <Plus className="size-6" aria-hidden />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            amountRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Agregar movimiento</DialogTitle>
            <DialogDescription className="sr-only">
              Registrá un gasto, ingreso o transferencia.
            </DialogDescription>
          </DialogHeader>

          {!options && optionsLoading && (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          )}
          {!options && optionsError && (
            <p className="text-sm text-destructive">{optionsError}</p>
          )}
          {options && options.accounts.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Primero creá una cuenta en{" "}
              <Link
                href="/finanzas/ajustes"
                className="font-medium text-foreground underline"
                onClick={() => setOpen(false)}
              >
                Ajustes
              </Link>
              .
            </div>
          )}

          {options && options.accounts.length > 0 && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="EXPENSE">Gasto</TabsTrigger>
                  <TabsTrigger value="INCOME">Ingreso</TabsTrigger>
                  <TabsTrigger value="TRANSFER">Transferencia</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qa-amount">
                  {mode === "TRANSFER" && sourceCurrency ? `Monto (${sourceCurrency})` : "Monto"}
                </Label>
                <Input
                  id="qa-amount"
                  ref={amountRef}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  className="h-14 text-3xl font-semibold"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>

              {mode !== "TRANSFER" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="qa-merchant">Comercio / descripción</Label>
                    <Input
                      id="qa-merchant"
                      className="h-11"
                      value={merchant}
                      onChange={(event) => setMerchant(event.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-account">Cuenta</Label>
                      <select
                        id="qa-account"
                        className={NATIVE_SELECT}
                        value={accountId}
                        onChange={(event) => {
                          const id = event.target.value;
                          setAccountId(id);
                          const account = options.accounts.find((a) => a.id === id);
                          if (account) setCurrency(account.currency);
                        }}
                      >
                        {accountsForMode(options, mode).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-currency">Moneda</Label>
                      <select
                        id="qa-currency"
                        className={NATIVE_SELECT}
                        value={currency}
                        onChange={(event) => setCurrency(event.target.value)}
                      >
                        {CURRENCIES.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-category">Categoría</Label>
                      <select
                        id="qa-category"
                        className={NATIVE_SELECT}
                        value={categoryId}
                        onChange={(event) => setCategoryId(event.target.value)}
                      >
                        <option value={NO_CATEGORY}>Sin categoría</option>
                        {options.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-date">Fecha</Label>
                      <Input
                        id="qa-date"
                        type="date"
                        className="h-11"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="qa-note">Nota</Label>
                    <Textarea
                      id="qa-note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-source">Desde</Label>
                      <select
                        id="qa-source"
                        className={NATIVE_SELECT}
                        value={sourceAccountId}
                        onChange={(event) => setSourceAccountId(event.target.value)}
                      >
                        {accountsForMode(options, "TRANSFER").map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} ({account.currency})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-destination">Hacia</Label>
                      <select
                        id="qa-destination"
                        className={NATIVE_SELECT}
                        value={destinationAccountId}
                        onChange={(event) => setDestinationAccountId(event.target.value)}
                      >
                        {destinationAccounts(options, sourceAccountId).length === 0 && (
                          <option value="">Sin otras cuentas</option>
                        )}
                        {destinationAccounts(options, sourceAccountId).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} ({account.currency})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {isFx && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-destination-amount">Llega ({destinationCurrency})</Label>
                      <Input
                        id="qa-destination-amount"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0,00"
                        className="h-11"
                        value={destinationAmount}
                        onChange={(event) => setDestinationAmount(event.target.value)}
                      />
                      {fxHint && <p className="text-xs text-muted-foreground">Tipo efectivo: {fxHint}</p>}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Para pagarle a otra persona (ej. renta) usá Gasto.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-transfer-date">Fecha</Label>
                      <Input
                        id="qa-transfer-date"
                        type="date"
                        className="h-11"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="qa-transfer-description">Descripción</Label>
                      <Input
                        id="qa-transfer-description"
                        className="h-11"
                        value={transferDescription}
                        onChange={(event) => setTransferDescription(event.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {formError && <p className="text-sm text-destructive">{formError}</p>}

              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={submitting}>
                {submitting ? "Guardando…" : "Guardar"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8">
          <div className="rounded-lg bg-foreground px-3 py-2 text-sm text-background shadow-lg">{toast}</div>
        </div>
      )}
    </>
  );
}
