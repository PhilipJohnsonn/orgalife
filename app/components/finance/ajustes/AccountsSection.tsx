"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { LedgerAccount, Region, postJson, selectClass, today } from "@/app/components/finance/cierre/shared";

const groupTypeLabels: Record<string, string> = {
  BANK: "Banco",
  WALLET: "Billetera",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

function inferRegion(currency: string): Region {
  if (currency === "ARS") return "ARGENTINA";
  if (currency === "AUD") return "AUSTRALIA";
  return "GLOBAL";
}

function emptyForm() {
  return {
    accountName: "",
    currency: "ARS",
    groupType: "BANK",
    groupName: "",
    region: "ARGENTINA" as Region,
    trackingMode: "TRANSACTIONAL",
    openingBalance: "0.00",
    openingOn: today(),
  };
}

export function AccountsSection({
  accounts,
  loading,
  onCreated,
}: {
  accounts: LedgerAccount[];
  loading: boolean;
  onCreated: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [groupNameEdited, setGroupNameEdited] = useState(false);
  const [regionEdited, setRegionEdited] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const effectiveRegion = regionEdited ? form.region : inferRegion(form.currency);

  function closeForm() {
    setForm(emptyForm());
    setGroupNameEdited(false);
    setRegionEdited(false);
    setError("");
    setShowForm(false);
  }

  async function saveAccount() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await postJson("/api/finance/v1/accounts", {
        groupName: groupNameEdited ? form.groupName : form.accountName,
        accountName: form.accountName,
        region: effectiveRegion,
        groupType: form.groupType,
        currency: form.currency,
        trackingMode: form.trackingMode,
        openingBalance: form.openingBalance,
        openingOn: form.openingOn,
      });
      closeForm();
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la cuenta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Cuentas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Cargando cuentas…</p>}
        {!loading && accounts.length === 0 && <p className="text-sm text-muted-foreground">Todavía no creaste ninguna cuenta.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{account.name}</p>
              <p className="text-xs text-muted-foreground">
                {account.group ? groupTypeLabels[account.group.type] ?? account.group.type : "-"} · {account.currency}
              </p>
              <p className={`tabular-nums ${Number(account.balance) < 0 ? "text-destructive" : ""}`}>
                {account.balance} {account.currency}
              </p>
            </div>
          ))}
        </div>

        {!loading && (
          <Button variant="outline" onClick={() => setShowForm(true)}>
            {accounts.length ? "Agregar cuenta" : "Crear primera cuenta"}
          </Button>
        )}

        <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : closeForm())}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nueva cuenta</DialogTitle>
              <DialogDescription>Con nombre, moneda y tipo alcanza. El resto es opcional.</DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void saveAccount();
              }}
            >
              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
            <div>
              <Label htmlFor="accountName">Nombre</Label>
              <Input id="accountName" value={form.accountName} onChange={(event) => setForm({ ...form, accountName: event.target.value })} placeholder="ICBC ARS" />
            </div>
            <div>
              <Label htmlFor="currency">Moneda</Label>
              <select id="currency" className={selectClass()} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option>ARS</option><option>USD</option><option>AUD</option></select>
            </div>
            <div>
              <Label htmlFor="groupType">Tipo</Label>
              <select id="groupType" className={selectClass()} value={form.groupType} onChange={(event) => setForm({ ...form, groupType: event.target.value })}><option value="BANK">Banco</option><option value="WALLET">Billetera</option><option value="CARD">Tarjeta</option><option value="OTHER">Otro</option></select>
            </div>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Más opciones</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="groupName">Entidad</Label>
                  <Input
                    id="groupName"
                    value={groupNameEdited ? form.groupName : form.accountName}
                    onChange={(event) => { setGroupNameEdited(true); setForm({ ...form, groupName: event.target.value }); }}
                    placeholder="ICBC, Mercado Pago..."
                  />
                </div>
                <div>
                  <Label htmlFor="region">Región</Label>
                  <select id="region" className={selectClass()} value={effectiveRegion} onChange={(event) => { setRegionEdited(true); setForm({ ...form, region: event.target.value as Region }); }}>
                    <option value="ARGENTINA">Argentina</option>
                    <option value="AUSTRALIA">Australia</option>
                    <option value="GLOBAL">Global</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="trackingMode">Seguimiento</Label>
                  <select id="trackingMode" className={selectClass()} value={form.trackingMode} onChange={(event) => setForm({ ...form, trackingMode: event.target.value })}><option value="TRANSACTIONAL">Transaccional</option><option value="DECLARED">Declarado</option></select>
                </div>
                <div>
                  <Label htmlFor="openingBalance">Saldo actual</Label>
                  <Input id="openingBalance" inputMode="decimal" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} />
                </div>
                <div>
                  <Label htmlFor="openingOn">Fecha del saldo</Label>
                  <Input id="openingOn" type="date" value={form.openingOn} onChange={(event) => setForm({ ...form, openingOn: event.target.value })} />
                </div>
              </div>
            </details>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" disabled={saving || !form.accountName.trim()}>{saving ? "Guardando..." : "Guardar cuenta"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
