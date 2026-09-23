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
import { Region, postJson, selectClass, today } from "@/app/components/finance/cierre/shared";

export type EntityPrefill = { groupName: string; groupType: string; region: Region };

function inferRegion(currency: string): Region {
  if (currency === "ARS") return "ARGENTINA";
  if (currency === "AUD") return "AUSTRALIA";
  return "GLOBAL";
}

function emptyForm(prefill: EntityPrefill | null) {
  return {
    accountName: "",
    currency: "ARS",
    groupType: prefill?.groupType ?? "BANK",
    groupName: prefill?.groupName ?? "",
    region: prefill?.region ?? ("ARGENTINA" as Region),
    trackingMode: "TRANSACTIONAL",
    openingBalance: "0.00",
    openingOn: today(),
  };
}

/**
 * Mounted only while the dialog should be open (see AccountsSection), so each
 * open starts from a fresh form matching the current `prefill`.
 */
export function CreateAccountDialog({
  prefill,
  onClose,
  onCreated,
}: {
  prefill: EntityPrefill | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [groupNameEdited, setGroupNameEdited] = useState(false);
  const [regionEdited, setRegionEdited] = useState(false);
  const [accountNameEdited, setAccountNameEdited] = useState(false);
  const [form, setForm] = useState(() => emptyForm(prefill));

  const effectiveRegion = prefill ? prefill.region : regionEdited ? form.region : inferRegion(form.currency);
  const effectiveAccountName = accountNameEdited
    ? form.accountName
    : prefill
      ? `${prefill.groupName} ${form.currency}`
      : form.accountName;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await postJson("/api/finance/v1/accounts", {
        groupName: prefill ? prefill.groupName : groupNameEdited ? form.groupName : effectiveAccountName,
        accountName: effectiveAccountName,
        region: effectiveRegion,
        groupType: prefill ? prefill.groupType : form.groupType,
        currency: form.currency,
        trackingMode: form.trackingMode,
        openingBalance: form.openingBalance,
        openingOn: form.openingOn,
      });
      onClose();
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la cuenta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{prefill ? "Nueva moneda" : "Nueva cuenta"}</DialogTitle>
          <DialogDescription>
            {prefill ? `Se agrega a ${prefill.groupName}.` : "Con nombre, moneda y tipo alcanza. El resto es opcional."}
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
            <Label htmlFor="accountName">Nombre</Label>
            <Input
              id="accountName"
              value={effectiveAccountName}
              onChange={(event) => {
                setAccountNameEdited(true);
                setForm({ ...form, accountName: event.target.value });
              }}
              placeholder="ICBC ARS"
            />
          </div>
          <div>
            <Label htmlFor="currency">Moneda</Label>
            <select id="currency" className={selectClass()} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
              <option>ARS</option>
              <option>USD</option>
              <option>AUD</option>
            </select>
          </div>
          {!prefill && (
            <div>
              <Label htmlFor="groupType">Tipo</Label>
              <select id="groupType" className={selectClass()} value={form.groupType} onChange={(event) => setForm({ ...form, groupType: event.target.value })}>
                <option value="BANK">Banco</option>
                <option value="WALLET">Billetera</option>
                <option value="CARD">Tarjeta</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
          )}

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Más opciones</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {!prefill && (
                <>
                  <div>
                    <Label htmlFor="groupName">Entidad</Label>
                    <Input
                      id="groupName"
                      value={groupNameEdited ? form.groupName : effectiveAccountName}
                      onChange={(event) => {
                        setGroupNameEdited(true);
                        setForm({ ...form, groupName: event.target.value });
                      }}
                      placeholder="ICBC, Mercado Pago..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="region">Región</Label>
                    <select
                      id="region"
                      className={selectClass()}
                      value={effectiveRegion}
                      onChange={(event) => {
                        setRegionEdited(true);
                        setForm({ ...form, region: event.target.value as Region });
                      }}
                    >
                      <option value="ARGENTINA">Argentina</option>
                      <option value="AUSTRALIA">Australia</option>
                      <option value="GLOBAL">Global</option>
                    </select>
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="trackingMode">Seguimiento</Label>
                <select id="trackingMode" className={selectClass()} value={form.trackingMode} onChange={(event) => setForm({ ...form, trackingMode: event.target.value })}>
                  <option value="TRANSACTIONAL">Transaccional</option>
                  <option value="DECLARED">Declarado</option>
                </select>
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
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving || !effectiveAccountName.trim()}>
              {saving ? "Guardando..." : "Guardar cuenta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
