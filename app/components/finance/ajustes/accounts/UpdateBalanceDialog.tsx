"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LedgerAccount, requestJson, today } from "@/app/components/finance/cierre/shared";

const BALANCE_PATTERN = /^-?\d{1,16}(?:[.,]\d{1,2})?$/;

function normalizeBalanceInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!BALANCE_PATTERN.test(trimmed)) return null;
  return trimmed.replace(",", ".");
}

export function UpdateBalanceDialog({
  account,
  onClose,
  onSaved,
}: {
  account: LedgerAccount;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [balanceInput, setBalanceInput] = useState(account.balance);
  const [occurredOn, setOccurredOn] = useState(today);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const normalizedBalance = normalizeBalanceInput(balanceInput);
  const diffCents =
    normalizedBalance === null ? null : Math.round((Number(normalizedBalance) - Number(account.balance)) * 100);
  const preview =
    diffCents === null
      ? ""
      : diffCents === 0
        ? "Sin cambios"
        : `Se registra ${diffCents > 0 ? "+" : ""}${(diffCents / 100).toFixed(2)} ${account.currency} como Rendimientos`;

  async function save() {
    if (saving || normalizedBalance === null) return;
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/finance/v1/accounts/${account.id}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: normalizedBalance, occurredOn, idempotencyKey }),
      });
      window.dispatchEvent(new Event("finance:changed"));
      onClose();
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el saldo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Actualizar saldo</DialogTitle>
          <DialogDescription>
            Saldo actual: {account.balance} {account.currency}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <div>
            <Label htmlFor={`balance-${account.id}`}>Saldo actual según tu banco</Label>
            <Input
              id={`balance-${account.id}`}
              inputMode="decimal"
              value={balanceInput}
              onChange={(event) => setBalanceInput(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`balance-date-${account.id}`}>Fecha</Label>
            <Input
              id={`balance-date-${account.id}`}
              type="date"
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </div>
          {preview && <p className="text-sm text-muted-foreground">{preview}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving || normalizedBalance === null}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
