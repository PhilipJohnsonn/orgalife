"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LedgerAccount = {
  id: string;
  name: string;
  currency: string;
  kind: string;
  trackingMode: string;
  balance: string;
};

type LedgerTransaction = {
  id: string;
  type: "INCOME" | "EXPENSE";
  status: string;
  occurredOn: string;
  description: string;
  amount: string;
  currency: string;
  account: { id: string; name: string } | null;
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function LedgerFinance() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accountForm, setAccountForm] = useState({
    groupName: "",
    accountName: "",
    region: "ARGENTINA",
    groupType: "BANK",
    currency: "ARS",
    trackingMode: "TRANSACTIONAL",
    openingBalance: "0.00",
    openingOn: today(),
  });
  const [transactionForm, setTransactionForm] = useState({
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    accountId: "",
    amount: "",
    occurredOn: today(),
    description: "",
  });

  const load = useCallback(async () => {
    const [accountsResponse, transactionsResponse] = await Promise.all([
      fetch("/api/finance/v1/accounts"),
      fetch("/api/finance/v1/transactions"),
    ]);
    if (!accountsResponse.ok || !transactionsResponse.ok) {
      throw new Error("No se pudieron cargar las finanzas v1");
    }
    setAccounts(await accountsResponse.json());
    setTransactions(await transactionsResponse.json());
  }, []);

  useEffect(() => {
    // The loader updates state only after its network requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar los datos."));
  }, [load]);

  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.kind === "ASSET"),
    [accounts]
  );

  const selectedAccountId = transactionForm.accountId || assetAccounts[0]?.id || "";

  async function saveAccount() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/v1/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountForm),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "No se pudo crear la cuenta");
      }
      setAccountForm((current) => ({ ...current, groupName: "", accountName: "", openingBalance: "0.00" }));
      setShowAccountForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la cuenta");
    } finally {
      setSaving(false);
    }
  }

  async function saveTransaction() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/v1/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...transactionForm,
          accountId: selectedAccountId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "No se pudo registrar el movimiento");
      }
      setTransactionForm((current) => ({ ...current, amount: "", description: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{account.name}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{account.balance} {account.currency}</p>
              <p className="text-xs text-muted-foreground">{account.trackingMode === "DECLARED" ? "Saldo declarado" : "Saldo transaccional"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" onClick={() => setShowAccountForm((value) => !value)}>
        {showAccountForm ? "Cancelar" : accounts.length ? "Agregar cuenta" : "Crear primera cuenta"}
      </Button>

      {(showAccountForm || accounts.length === 0) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Nueva cuenta</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label htmlFor="groupName">Entidad</Label><Input id="groupName" value={accountForm.groupName} onChange={(event) => setAccountForm({ ...accountForm, groupName: event.target.value })} placeholder="ICBC, Mercado Pago..." /></div>
            <div><Label htmlFor="accountName">Nombre de cuenta</Label><Input id="accountName" value={accountForm.accountName} onChange={(event) => setAccountForm({ ...accountForm, accountName: event.target.value })} placeholder="ICBC ARS" /></div>
            <div><Label htmlFor="region">Región</Label><select id="region" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={accountForm.region} onChange={(event) => setAccountForm({ ...accountForm, region: event.target.value })}><option value="ARGENTINA">Argentina</option><option value="AUSTRALIA">Australia</option><option value="GLOBAL">Global</option></select></div>
            <div><Label htmlFor="groupType">Tipo</Label><select id="groupType" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={accountForm.groupType} onChange={(event) => setAccountForm({ ...accountForm, groupType: event.target.value })}><option value="BANK">Banco</option><option value="WALLET">Billetera</option><option value="CARD">Tarjeta</option><option value="OTHER">Otra</option></select></div>
            <div><Label htmlFor="currency">Moneda</Label><select id="currency" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={accountForm.currency} onChange={(event) => setAccountForm({ ...accountForm, currency: event.target.value })}><option>ARS</option><option>USD</option><option>AUD</option></select></div>
            <div><Label htmlFor="trackingMode">Seguimiento</Label><select id="trackingMode" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={accountForm.trackingMode} onChange={(event) => setAccountForm({ ...accountForm, trackingMode: event.target.value })}><option value="TRANSACTIONAL">Transaccional</option><option value="DECLARED">Declarado</option></select></div>
            <div><Label htmlFor="openingBalance">Saldo actual</Label><Input id="openingBalance" inputMode="decimal" value={accountForm.openingBalance} onChange={(event) => setAccountForm({ ...accountForm, openingBalance: event.target.value })} /></div>
            <div><Label htmlFor="openingOn">Fecha del saldo</Label><Input id="openingOn" type="date" value={accountForm.openingOn} onChange={(event) => setAccountForm({ ...accountForm, openingOn: event.target.value })} /></div>
            <Button className="sm:col-span-2 lg:col-span-4" onClick={saveAccount} disabled={saving}>{saving ? "Guardando..." : "Guardar cuenta"}</Button>
          </CardContent>
        </Card>
      )}

      {assetAccounts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Registrar ingreso o gasto</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><Label htmlFor="movementType">Tipo</Label><select id="movementType" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={transactionForm.type} onChange={(event) => setTransactionForm({ ...transactionForm, type: event.target.value as "INCOME" | "EXPENSE" })}><option value="EXPENSE">Gasto</option><option value="INCOME">Ingreso</option></select></div>
            <div><Label htmlFor="movementAccount">Cuenta</Label><select id="movementAccount" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={selectedAccountId} onChange={(event) => setTransactionForm({ ...transactionForm, accountId: event.target.value })}>{assetAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></div>
            <div><Label htmlFor="movementAmount">Importe</Label><Input id="movementAmount" inputMode="decimal" value={transactionForm.amount} onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })} /></div>
            <div><Label htmlFor="movementDate">Fecha</Label><Input id="movementDate" type="date" value={transactionForm.occurredOn} onChange={(event) => setTransactionForm({ ...transactionForm, occurredOn: event.target.value })} /></div>
            <div><Label htmlFor="movementDescription">Descripción</Label><Input id="movementDescription" value={transactionForm.description} onChange={(event) => setTransactionForm({ ...transactionForm, description: event.target.value })} /></div>
            <Button className="sm:col-span-2 lg:col-span-5" onClick={saveTransaction} disabled={saving}>{saving ? "Guardando..." : "Registrar movimiento"}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Movimientos confirmados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {transactions.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>}
          {transactions.map((transaction) => (
            <div key={transaction.id} className="grid gap-1 rounded-md border p-3 text-sm sm:grid-cols-[6rem_1fr_auto] sm:items-center sm:gap-3">
              <span className="text-muted-foreground">{transaction.occurredOn}</span>
              <span>{transaction.description}</span>
              <span className={transaction.type === "INCOME" ? "text-emerald-600" : "text-destructive"}>{transaction.type === "INCOME" ? "+" : "−"}{transaction.amount} {transaction.currency}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
