"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Account = {
  id: string;
  name: string;
  currency: string;
  kind: string;
  group: { type: string } | null;
};

type Statement = {
  status: "DRAFT" | "CONFIRMED" | "REVERSED";
  closingOn: string;
  lines: {
    id: string;
    description: string;
    classification: string;
    paymentTreatment: string;
    billedCurrency: string;
    billedAmount: string;
    category: { id: string; name: string } | null;
  }[];
};

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

type CategoryData = {
  categories: { id: string; name: string; color: string }[];
  rules: {
    id: string;
    patternNormalized: string;
    isActive: boolean;
    category: { id: string; name: string };
  }[];
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? "No se pudo guardar");
  return body;
}

export function FinancePlanning({
  accounts,
  statements,
  onLedgerChanged,
}: {
  accounts: Account[];
  statements: Statement[];
  onLedgerChanged: () => Promise<void>;
}) {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [commitmentTotals, setCommitmentTotals] = useState<{ currency: string; once: string; weekly: string; monthly: string; monthlyAverage: string }[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData>({ categories: [], rules: [] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showObligationForm, setShowObligationForm] = useState(false);
  const [showCommitmentForm, setShowCommitmentForm] = useState(false);
  const [settlingId, setSettlingId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [lineCategories, setLineCategories] = useState<Record<string, string>>({});
  const [learnRules, setLearnRules] = useState<Record<string, boolean>>({});
  const [commitmentLines, setCommitmentLines] = useState<Record<string, string>>({});
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
    const [obligationBody, commitmentBody, categoriesBody] = await Promise.all([
      requestJson("/api/finance/v1/obligations"),
      requestJson("/api/finance/v1/commitments"),
      requestJson("/api/finance/v1/categories"),
    ]);
    setObligations(obligationBody);
    setCommitments(commitmentBody.commitments);
    setCommitmentTotals(commitmentBody.totals);
    setCategoryData(categoriesBody);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar obligaciones y compromisos."));
  }, [load]);

  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.kind === "ASSET"),
    [accounts]
  );
  const purchaseLines = useMemo(
    () => statements.filter((statement) => statement.status !== "REVERSED").flatMap((statement) =>
      statement.lines
        .filter((line) => line.paymentTreatment === "PAYABLE" && ["PURCHASE", "FEE", "INTEREST"].includes(line.classification))
        .map((line) => ({ ...line, statementStatus: statement.status, closingOn: statement.closingOn }))
    ),
    [statements]
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

  async function createCategory() {
    setSaving(true);
    try {
      await requestJson("/api/finance/v1/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName }),
      });
      setCategoryName("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la categoría");
    } finally {
      setSaving(false);
    }
  }

  async function categorizeLine(line: Statement["lines"][number]) {
    const categoryId = lineCategories[line.id] ?? line.category?.id;
    if (!categoryId) return;
    setSaving(true);
    try {
      await requestJson(`/api/finance/v1/card-statements/lines/${line.id}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, learnRule: learnRules[line.id] ?? false }),
      });
      await Promise.all([load(), onLedgerChanged()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo categorizar el consumo");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateRule(id: string) {
    setSaving(true);
    try {
      await requestJson(`/api/finance/v1/category-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo desactivar la regla");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Me deben / debo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={() => setShowObligationForm((value) => !value)}>{showObligationForm ? "Cancelar" : "Registrar obligación"}</Button>
          {showObligationForm && (
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label htmlFor="obligationDirection">Dirección</Label><select id="obligationDirection" className={selectClass} value={obligationForm.direction} onChange={(event) => setObligationForm({ ...obligationForm, direction: event.target.value })}><option value="RECEIVABLE">Me deben</option><option value="PAYABLE">Debo</option></select></div>
              <div><Label htmlFor="obligationOrigin">Origen</Label><select id="obligationOrigin" className={selectClass} value={obligationForm.originType} onChange={(event) => setObligationForm({ ...obligationForm, originType: event.target.value })}><option value="ACCOUNT_MOVEMENT">Movimiento ahora</option><option value="OPENING_BALANCE">Ya existía</option></select></div>
              <div><Label htmlFor="obligationCounterparty">Contraparte</Label><Input id="obligationCounterparty" value={obligationForm.counterparty} onChange={(event) => setObligationForm({ ...obligationForm, counterparty: event.target.value })} /></div>
              <div><Label htmlFor="obligationDescription">Descripción</Label><Input id="obligationDescription" value={obligationForm.description} onChange={(event) => setObligationForm({ ...obligationForm, description: event.target.value })} /></div>
              <div><Label htmlFor="obligationCurrency">Moneda</Label><select id="obligationCurrency" className={selectClass} value={obligationForm.currency} onChange={(event) => setObligationForm({ ...obligationForm, currency: event.target.value, assetAccountId: "" })}><option>ARS</option><option>USD</option><option>AUD</option></select></div>
              <div><Label htmlFor="obligationAmount">Importe</Label><Input id="obligationAmount" inputMode="decimal" value={obligationForm.amount} onChange={(event) => setObligationForm({ ...obligationForm, amount: event.target.value })} /></div>
              <div><Label htmlFor="obligationDate">Fecha</Label><Input id="obligationDate" type="date" value={obligationForm.occurredOn} onChange={(event) => setObligationForm({ ...obligationForm, occurredOn: event.target.value })} /></div>
              <div><Label htmlFor="obligationDue">Vencimiento opcional</Label><Input id="obligationDue" type="date" value={obligationForm.dueOn} onChange={(event) => setObligationForm({ ...obligationForm, dueOn: event.target.value })} /></div>
              {obligationForm.originType === "ACCOUNT_MOVEMENT" && <div className="sm:col-span-2"><Label htmlFor="obligationAccount">Cuenta</Label><select id="obligationAccount" className={selectClass} value={obligationForm.assetAccountId || assetAccounts.find((account) => account.currency === obligationForm.currency)?.id || ""} onChange={(event) => setObligationForm({ ...obligationForm, assetAccountId: event.target.value })}>{assetAccounts.filter((account) => account.currency === obligationForm.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>}
              <Button className="sm:col-span-2 lg:col-span-4" onClick={saveObligation} disabled={saving}>Guardar obligación</Button>
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">“Me deben” con movimiento ahora descuenta la cuenta porque prestaste dinero. “Ya existía” abre el saldo sin inventar un ingreso o egreso.</p>
            </div>
          )}
          {obligations.length === 0 && <p className="text-sm text-muted-foreground">No hay obligaciones registradas.</p>}
          {obligations.map((obligation) => (
            <div key={obligation.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{obligation.counterparty}</strong> · {obligation.description}</span><span className="tabular-nums">Pendiente {obligation.pendingAmount} {obligation.currency} · {obligation.status}</span></div>
              {obligation.status !== "SETTLED" && <Button className="mt-2" size="sm" variant="outline" onClick={() => { setSettlingId(obligation.id); setSettlementForm({ amount: obligation.pendingAmount, occurredOn: today(), assetAccountId: "" }); }}>{obligation.direction === "RECEIVABLE" ? "Registrar cobro" : "Registrar pago"}</Button>}
              {settlingId === obligation.id && <div className="mt-3 grid gap-2 sm:grid-cols-4"><select aria-label="Cuenta de cancelación" className={selectClass} value={settlementForm.assetAccountId || assetAccounts.find((account) => account.currency === obligation.currency)?.id || ""} onChange={(event) => setSettlementForm({ ...settlementForm, assetAccountId: event.target.value })}>{assetAccounts.filter((account) => account.currency === obligation.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><Input aria-label="Importe de cancelación" inputMode="decimal" value={settlementForm.amount} onChange={(event) => setSettlementForm({ ...settlementForm, amount: event.target.value })} /><Input aria-label="Fecha de cancelación" type="date" value={settlementForm.occurredOn} onChange={(event) => setSettlementForm({ ...settlementForm, occurredOn: event.target.value })} /><Button onClick={() => settle(obligation)} disabled={saving}>Confirmar</Button></div>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Suscripciones y compromisos informativos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">{commitmentTotals.map((total) => <span key={total.currency} className="rounded bg-muted px-2 py-1">{total.currency}: semanal {total.weekly} · mensual {total.monthly} · promedio mensual {total.monthlyAverage}</span>)}</div>
          <Button variant="outline" onClick={() => setShowCommitmentForm((value) => !value)}>{showCommitmentForm ? "Cancelar" : "Agregar compromiso"}</Button>
          {showCommitmentForm && <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"><div><Label htmlFor="commitmentName">Nombre</Label><Input id="commitmentName" value={commitmentForm.name} onChange={(event) => setCommitmentForm({ ...commitmentForm, name: event.target.value })} /></div><div><Label htmlFor="commitmentAmount">Importe esperado</Label><Input id="commitmentAmount" inputMode="decimal" value={commitmentForm.expectedAmount} onChange={(event) => setCommitmentForm({ ...commitmentForm, expectedAmount: event.target.value })} /></div><div><Label htmlFor="commitmentCurrency">Moneda</Label><select id="commitmentCurrency" className={selectClass} value={commitmentForm.currency} onChange={(event) => setCommitmentForm({ ...commitmentForm, currency: event.target.value, expectedAccountId: "" })}><option>ARS</option><option>USD</option><option>AUD</option></select></div><div><Label htmlFor="commitmentFrequency">Frecuencia</Label><select id="commitmentFrequency" className={selectClass} value={commitmentForm.frequency} onChange={(event) => setCommitmentForm({ ...commitmentForm, frequency: event.target.value })}><option value="ONCE">Una vez</option><option value="WEEKLY">Semanal</option><option value="MONTHLY">Mensual</option></select></div><div><Label htmlFor="commitmentStart">Comienza</Label><Input id="commitmentStart" type="date" value={commitmentForm.startsOn} onChange={(event) => setCommitmentForm({ ...commitmentForm, startsOn: event.target.value })} /></div><div><Label htmlFor="commitmentEnd">Finaliza opcional</Label><Input id="commitmentEnd" type="date" value={commitmentForm.endsOn} onChange={(event) => setCommitmentForm({ ...commitmentForm, endsOn: event.target.value })} /></div><div className="sm:col-span-2"><Label htmlFor="commitmentAccount">Cuenta o tarjeta esperada</Label><select id="commitmentAccount" className={selectClass} value={commitmentForm.expectedAccountId} onChange={(event) => setCommitmentForm({ ...commitmentForm, expectedAccountId: event.target.value })}><option value="">Sin especificar</option>{accounts.filter((account) => account.currency === commitmentForm.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div><Button className="sm:col-span-2 lg:col-span-4" onClick={saveCommitment} disabled={saving}>Guardar compromiso</Button><p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Es informativo: no descuenta dinero ni duplica el consumo que después aparece en la tarjeta.</p></div>}
          {commitments.map((commitment) => { const eligible = purchaseLines.filter((line) => line.statementStatus === "CONFIRMED" && line.billedCurrency === commitment.currency && !commitment.observedLineIds.includes(line.id)); return <div key={commitment.id} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span><strong>{commitment.name}</strong> · {commitment.expectedAmount} {commitment.currency} · {commitment.frequency}</span><span>{commitment.status}{commitment.difference !== null ? ` · diferencia ${commitment.difference}` : " · sin cargo observado"}</span></div>{commitment.status === "ACTIVE" && <div className="mt-2 flex flex-wrap gap-2"><select aria-label={`Cargo observado para ${commitment.name}`} className={selectClass} value={commitmentLines[commitment.id] ?? ""} onChange={(event) => setCommitmentLines({ ...commitmentLines, [commitment.id]: event.target.value })}><option value="">Vincular un consumo real…</option>{eligible.map((line) => <option key={line.id} value={line.id}>{line.closingOn} · {line.description} · {line.billedAmount}</option>)}</select><Button size="sm" variant="outline" onClick={() => linkCommitment(commitment)} disabled={saving || !commitmentLines[commitment.id]}>Vincular</Button><Button size="sm" variant="ghost" onClick={() => cancelCommitment(commitment.id)} disabled={saving}>Cancelar compromiso</Button></div>}</div>; })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Categorías y reglas aprendidas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2"><Input aria-label="Nueva categoría" placeholder="Nueva categoría" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /><Button onClick={createCategory} disabled={saving || !categoryName.trim()}>Crear</Button></div>
          {purchaseLines.map((line) => <div key={line.id} className="grid gap-2 rounded-md border p-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto_auto] sm:items-center"><span>{line.description} · {line.billedAmount} {line.billedCurrency}</span><select aria-label={`Categoría de ${line.description}`} className={selectClass} value={lineCategories[line.id] ?? line.category?.id ?? ""} onChange={(event) => setLineCategories({ ...lineCategories, [line.id]: event.target.value })}><option value="">Sin categoría</option>{categoryData.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><label className="flex items-center gap-1"><input type="checkbox" checked={learnRules[line.id] ?? false} onChange={(event) => setLearnRules({ ...learnRules, [line.id]: event.target.checked })} /> Recordar</label><Button size="sm" variant="outline" onClick={() => categorizeLine(line)} disabled={saving || !(lineCategories[line.id] ?? line.category?.id)}>Guardar</Button></div>)}
          {categoryData.rules.filter((rule) => rule.isActive).map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 p-2 text-sm"><span>{rule.patternNormalized} → {rule.category.name}</span><Button size="sm" variant="ghost" onClick={() => deactivateRule(rule.id)} disabled={saving}>Desactivar</Button></div>)}
        </CardContent>
      </Card>
    </div>
  );
}
