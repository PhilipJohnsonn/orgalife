"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LedgerAccount, requestJson, selectClass, today } from "@/app/components/finance/cierre/shared";
import { PurchaseLine } from "./purchaseLines";

type Commitment = {
  id: string;
  name: string;
  expectedAmount: string;
  currency: string;
  frequency: "ONCE" | "WEEKLY" | "MONTHLY";
  status: "ACTIVE" | "CANCELLED";
  observedAmount: string;
  difference: string | null;
  missingObservedCharge: boolean;
  observedLineIds: string[];
};

export function CommitmentsSection({
  accounts,
  purchaseLines,
}: {
  accounts: LedgerAccount[];
  purchaseLines: PurchaseLine[];
}) {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [commitmentTotals, setCommitmentTotals] = useState<{ currency: string; once: string; weekly: string; monthly: string; monthlyAverage: string }[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCommitmentForm, setShowCommitmentForm] = useState(false);
  const [commitmentLines, setCommitmentLines] = useState<Record<string, string>>({});
  const [commitmentForm, setCommitmentForm] = useState({
    name: "",
    expectedAmount: "",
    currency: "ARS",
    frequency: "MONTHLY",
    startsOn: today(),
    endsOn: "",
    expectedAccountId: "",
  });

  const load = useCallback(async () => {
    const body = await requestJson("/api/finance/v1/commitments");
    setCommitments(body.commitments);
    setCommitmentTotals(body.totals);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar los compromisos."));
  }, [load]);

  async function saveCommitment() {
    setSaving(true);
    setError("");
    try {
      await requestJson("/api/finance/v1/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...commitmentForm,
          endsOn: commitmentForm.endsOn || undefined,
          expectedAccountId: commitmentForm.expectedAccountId || undefined,
        }),
      });
      setCommitmentForm((current) => ({ ...current, name: "", expectedAmount: "", endsOn: "" }));
      setShowCommitmentForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el compromiso");
    } finally {
      setSaving(false);
    }
  }

  async function cancelCommitment(id: string) {
    setSaving(true);
    try {
      await requestJson(`/api/finance/v1/commitments/${id}`, { method: "DELETE" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cancelar el compromiso");
    } finally {
      setSaving(false);
    }
  }

  async function linkCommitment(commitment: Commitment) {
    const statementLineId = commitmentLines[commitment.id];
    if (!statementLineId) return;
    setSaving(true);
    try {
      await requestJson("/api/finance/v1/commitments/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitmentId: commitment.id, statementLineId }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo vincular el cargo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Suscripciones y compromisos informativos</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2 text-sm">{commitmentTotals.map((total) => <span key={total.currency} className="rounded bg-muted px-2 py-1">{total.currency}: semanal {total.weekly} · mensual {total.monthly} · promedio mensual {total.monthlyAverage}</span>)}</div>
        <Button variant="outline" onClick={() => setShowCommitmentForm((value) => !value)}>{showCommitmentForm ? "Cancelar" : "Agregar compromiso"}</Button>
        {showCommitmentForm && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"><div><Label htmlFor="commitmentName">Nombre</Label><Input id="commitmentName" value={commitmentForm.name} onChange={(event) => setCommitmentForm({ ...commitmentForm, name: event.target.value })} /></div><div><Label htmlFor="commitmentAmount">Importe esperado</Label><Input id="commitmentAmount" inputMode="decimal" value={commitmentForm.expectedAmount} onChange={(event) => setCommitmentForm({ ...commitmentForm, expectedAmount: event.target.value })} /></div><div><Label htmlFor="commitmentCurrency">Moneda</Label><select id="commitmentCurrency" className={selectClass()} value={commitmentForm.currency} onChange={(event) => setCommitmentForm({ ...commitmentForm, currency: event.target.value, expectedAccountId: "" })}><option>ARS</option><option>USD</option><option>AUD</option></select></div><div><Label htmlFor="commitmentFrequency">Frecuencia</Label><select id="commitmentFrequency" className={selectClass()} value={commitmentForm.frequency} onChange={(event) => setCommitmentForm({ ...commitmentForm, frequency: event.target.value })}><option value="ONCE">Una vez</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option></select></div><div><Label htmlFor="commitmentStart">Comienza</Label><Input id="commitmentStart" type="date" value={commitmentForm.startsOn} onChange={(event) => setCommitmentForm({ ...commitmentForm, startsOn: event.target.value })} /></div><div><Label htmlFor="commitmentEnd">Finaliza opcional</Label><Input id="commitmentEnd" type="date" value={commitmentForm.endsOn} onChange={(event) => setCommitmentForm({ ...commitmentForm, endsOn: event.target.value })} /></div><div className="sm:col-span-2"><Label htmlFor="commitmentAccount">Cuenta o tarjeta esperada</Label><select id="commitmentAccount" className={selectClass()} value={commitmentForm.expectedAccountId} onChange={(event) => setCommitmentForm({ ...commitmentForm, expectedAccountId: event.target.value })}><option value="">Sin especificar</option>{accounts.filter((account) => account.currency === commitmentForm.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div><Button className="sm:col-span-2 lg:col-span-4" onClick={saveCommitment} disabled={saving}>Guardar compromiso</Button><p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Es informativo: no descuenta dinero ni duplica el consumo que después aparece en la tarjeta.</p></div>}
        {commitments.map((commitment) => { const eligible = purchaseLines.filter((line) => line.statementStatus === "CONFIRMED" && line.billedCurrency === commitment.currency && !commitment.observedLineIds.includes(line.id)); return <div key={commitment.id} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{commitment.name}</strong> · {commitment.expectedAmount} {commitment.currency} · {commitment.frequency}</span><span>{commitment.status}{commitment.difference !== null ? ` · diferencia ${commitment.difference}` : " · sin cargo observado"}</span></div>{commitment.status === "ACTIVE" && <div className="mt-2 flex flex-wrap gap-2"><select aria-label={`Cargo observado para ${commitment.name}`} className={selectClass()} value={commitmentLines[commitment.id] ?? ""} onChange={(event) => setCommitmentLines({ ...commitmentLines, [commitment.id]: event.target.value })}><option value="">Vincular un consumo real…</option>{eligible.map((line) => <option key={line.id} value={line.id}>{line.closingOn} · {line.description} · {line.billedAmount}</option>)}</select><Button size="sm" variant="outline" onClick={() => linkCommitment(commitment)} disabled={saving || !commitmentLines[commitment.id]}>Vincular</Button><Button size="sm" variant="ghost" onClick={() => cancelCommitment(commitment.id)} disabled={saving}>Cancelar compromiso</Button></div>}</div>; })}
      </CardContent>
    </Card>
  );
}
