"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestJson, selectClass } from "@/app/components/finance/cierre/shared";

type WalletAlias = {
  id: string;
  label: string;
  aliasNormalized: string;
  ledgerAccountId: string;
  ledgerAccount: { id: string; name: string; currency: string };
};

type QuickCaptureAccount = { id: string; name: string; currency: string; kind: string };

export function WalletAliasesSection() {
  const [aliases, setAliases] = useState<WalletAlias[]>([]);
  const [accounts, setAccounts] = useState<QuickCaptureAccount[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ label: "", ledgerAccountId: "" });

  const load = useCallback(async () => {
    const [aliasesBody, optionsBody] = await Promise.all([
      requestJson("/api/finance/v1/wallet-aliases"),
      requestJson("/api/finance/v1/quick-capture/options"),
    ]);
    setAliases(aliasesBody);
    setAccounts(optionsBody.accounts);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .catch(() => setError("No se pudieron cargar las tarjetas de Wallet."))
      .finally(() => setLoading(false));
  }, [load]);

  const selectedAccountId = accounts.some((account) => account.id === form.ledgerAccountId)
    ? form.ledgerAccountId
    : accounts[0]?.id ?? "";

  async function createAlias() {
    if (saving || !form.label.trim() || !selectedAccountId) return;
    setSaving(true);
    setError("");
    try {
      await requestJson("/api/finance/v1/wallet-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label.trim(), ledgerAccountId: selectedAccountId }),
      });
      setForm({ label: "", ledgerAccountId: "" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la tarjeta");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAlias(id: string) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/finance/v1/wallet-aliases/${id}`, { method: "DELETE" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la tarjeta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tarjetas de Apple Pay (Wallet)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Escribí el nombre exacto de la tarjeta como aparece en Wallet (ej. &quot;Revolut&quot;, &quot;ICBC Visa&quot;).
        </p>

        {!loading && aliases.length === 0 && <p className="text-sm text-muted-foreground">Todavía no asociaste ninguna tarjeta.</p>}
        {aliases.map((alias) => (
          <div key={alias.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span>{alias.label} → {alias.ledgerAccount.name} ({alias.ledgerAccount.currency})</span>
            <Button size="sm" variant="ghost" onClick={() => deleteAlias(alias.id)} disabled={saving}>Eliminar</Button>
          </div>
        ))}

        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div>
            <Label htmlFor="walletAliasLabel">Nombre en Wallet</Label>
            <Input id="walletAliasLabel" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="ICBC Visa" />
          </div>
          <div>
            <Label htmlFor="walletAliasAccount">Cuenta</Label>
            <select id="walletAliasAccount" className={selectClass()} value={selectedAccountId} onChange={(event) => setForm({ ...form, ledgerAccountId: event.target.value })}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
            </select>
          </div>
          <Button className="self-end" onClick={createAlias} disabled={saving || !form.label.trim() || !selectedAccountId}>
            {saving ? "Guardando..." : "Agregar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
