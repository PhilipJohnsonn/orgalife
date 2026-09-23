"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LedgerAccount, requestJson, selectClass, today } from "./shared";

type Obligation = {
  id: string;
  direction: "RECEIVABLE" | "PAYABLE";
  counterparty: string;
  description: string;
  currency: string;
  originalAmount: string;
  settledAmount: string;
  pendingAmount: string;
  dueOn: string | null;
  status: "OPEN" | "PARTIAL" | "SETTLED";
};

export function ObligationsSection({
  accounts,
  onLedgerChanged,
}: {
  accounts: LedgerAccount[];
  onLedgerChanged: () => Promise<void>;
}) {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showObligationForm, setShowObligationForm] = useState(false);
  const [settlingId, setSettlingId] = useState("");
  const [obligationForm, setObligationForm] = useState({
    direction: "RECEIVABLE",
    originType: "ACCOUNT_MOVEMENT",
    counterparty: "",
    description: "",
    currency: "ARS",
    amount: "",
    occurredOn: today(),
    dueOn: "",
    assetAccountId: "",
  });
  const [settlementForm, setSettlementForm] = useState({
    assetAccountId: "",
    amount: "",
    occurredOn: today(),
  });

  const load = useCallback(async () => {
    setObligations(await requestJson("/api/finance/v1/obligations"));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar las obligaciones."));
  }, [load]);

  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.kind === "ASSET"),
    [accounts]
  );

  async function saveObligation() {
    setSaving(true);
    setError("");
    try {
      const matchingAccount = assetAccounts.find(
        (account) => account.currency === obligationForm.currency &&
          (!obligationForm.assetAccountId || account.id === obligationForm.assetAccountId)
      );
      await requestJson("/api/finance/v1/obligations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...obligationForm,
          assetAccountId: obligationForm.originType === "ACCOUNT_MOVEMENT" ? matchingAccount?.id : undefined,
          dueOn: obligationForm.dueOn || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setObligationForm((current) => ({ ...current, counterparty: "", description: "", amount: "", dueOn: "" }));
      setShowObligationForm(false);
      await Promise.all([load(), onLedgerChanged()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la obligación");
    } finally {
      setSaving(false);
    }
  }

  async function settle(obligation: Obligation) {
    setSaving(true);
    setError("");
    try {
      const account = assetAccounts.find(
        (candidate) => candidate.currency === obligation.currency &&
          (!settlementForm.assetAccountId || candidate.id === settlementForm.assetAccountId)
      );
      await requestJson("/api/finance/v1/obligations/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obligationId: obligation.id,
          assetAccountId: account?.id,
          amount: settlementForm.amount,
          occurredOn: settlementForm.occurredOn,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setSettlingId("");
      await Promise.all([load(), onLedgerChanged()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar la cancelación");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Me deben / debo</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <Button variant="outline" onClick={() => setShowObligationForm((value) => !value)}>{showObligationForm ? "Cancelar" : "Registrar obligación"}</Button>
        {showObligationForm && (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label htmlFor="obligationDirection">Dirección</Label><select id="obligationDirection" className={selectClass()} value={obligationForm.direction} onChange={(event) => setObligationForm({ ...obligationForm, direction: event.target.value })}><option value="RECEIVABLE">Me deben</option><option value="PAYABLE">Debo</option></select></div>
            <div><Label htmlFor="obligationOrigin">Origen</Label><select id="obligationOrigin" className={selectClass()} value={obligationForm.originType} onChange={(event) => setObligationForm({ ...obligationForm, originType: event.target.value })}><option value="ACCOUNT_MOVEMENT">Movimiento ahora</option><option value="OPENING_BALANCE">Ya existía</option></select></div>
            <div><Label htmlFor="obligationCounterparty">Contraparte</Label><Input id="obligationCounterparty" value={obligationForm.counterparty} onChange={(event) => setObligationForm({ ...obligationForm, counterparty: event.target.value })} /></div>
            <div><Label htmlFor="obligationDescription">Descripción</Label><Input id="obligationDescription" value={obligationForm.description} onChange={(event) => setObligationForm({ ...obligationForm, description: event.target.value })} /></div>
            <div><Label htmlFor="obligationCurrency">Moneda</Label><select id="obligationCurrency" className={selectClass()} value={obligationForm.currency} onChange={(event) => setObligationForm({ ...obligationForm, currency: event.target.value, assetAccountId: "" })}><option>ARS</option><option>USD</option><option>AUD</option></select></div>
            <div><Label htmlFor="obligationAmount">Importe</Label><Input id="obligationAmount" inputMode="decimal" value={obligationForm.amount} onChange={(event) => setObligationForm({ ...obligationForm, amount: event.target.value })} /></div>
            <div><Label htmlFor="obligationDate">Fecha</Label><Input id="obligationDate" type="date" value={obligationForm.occurredOn} onChange={(event) => setObligationForm({ ...obligationForm, occurredOn: event.target.value })} /></div>
            <div><Label htmlFor="obligationDue">Vencimiento opcional</Label><Input id="obligationDue" type="date" value={obligationForm.dueOn} onChange={(event) => setObligationForm({ ...obligationForm, dueOn: event.target.value })} /></div>
            {obligationForm.originType === "ACCOUNT_MOVEMENT" && <div className="sm:col-span-2"><Label htmlFor="obligationAccount">Cuenta</Label><select id="obligationAccount" className={selectClass()} value={obligationForm.assetAccountId || assetAccounts.find((account) => account.currency === obligationForm.currency)?.id || ""} onChange={(event) => setObligationForm({ ...obligationForm, assetAccountId: event.target.value })}>{assetAccounts.filter((account) => account.currency === obligationForm.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>}
            <Button className="sm:col-span-2 lg:col-span-4" onClick={saveObligation} disabled={saving}>Guardar obligación</Button>
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">“Me deben” con movimiento ahora descuenta la cuenta porque prestaste dinero. “Ya existía” abre el saldo sin inventar un ingreso o egreso.</p>
          </div>
        )}
        {obligations.length === 0 && <p className="text-sm text-muted-foreground">No hay obligaciones registradas.</p>}
        {obligations.map((obligation) => (
          <div key={obligation.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{obligation.counterparty}</strong> · {obligation.description}</span><span className="tabular-nums">Pendiente {obligation.pendingAmount} {obligation.currency} · {obligation.status}</span></div>
            {obligation.status !== "SETTLED" && <Button className="mt-2" size="sm" variant="outline" onClick={() => { setSettlingId(obligation.id); setSettlementForm({ amount: obligation.pendingAmount, occurredOn: today(), assetAccountId: "" }); }}>{obligation.direction === "RECEIVABLE" ? "Registrar cobro" : "Registrar pago"}</Button>}
            {settlingId === obligation.id && <div className="mt-3 grid gap-2 sm:grid-cols-4"><select aria-label="Cuenta de cancelación" className={selectClass()} value={settlementForm.assetAccountId || assetAccounts.find((account) => account.currency === obligation.currency)?.id || ""} onChange={(event) => setSettlementForm({ ...settlementForm, assetAccountId: event.target.value })}>{assetAccounts.filter((account) => account.currency === obligation.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><Input aria-label="Importe de cancelación" inputMode="decimal" value={settlementForm.amount} onChange={(event) => setSettlementForm({ ...settlementForm, amount: event.target.value })} /><Input aria-label="Fecha de cancelación" type="date" value={settlementForm.occurredOn} onChange={(event) => setSettlementForm({ ...settlementForm, occurredOn: event.target.value })} /><Button onClick={() => settle(obligation)} disabled={saving}>Confirmar</Button></div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
