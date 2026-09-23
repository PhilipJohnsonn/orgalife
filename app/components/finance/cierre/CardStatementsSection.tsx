"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CardPaymentState,
  CardProvisional,
  CardStatement,
  LedgerAccount,
  postJson,
  selectClass,
  today,
} from "./shared";

export function CardStatementsSection({
  accounts,
  statements,
  provisionals,
  onChanged,
}: {
  accounts: LedgerAccount[];
  statements: CardStatement[];
  provisionals: CardProvisional[];
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warningKey, setWarningKey] = useState("");
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [statementFileKey, setStatementFileKey] = useState(0);
  const [cardGroupId, setCardGroupId] = useState("");
  const [showProvisionalForm, setShowProvisionalForm] = useState(false);
  const [paymentState, setPaymentState] = useState<CardPaymentState | null>(null);
  const [provisionalForm, setProvisionalForm] = useState({
    cardGroupId: "",
    currency: "ARS",
    amount: "",
    occurredOn: today(),
    description: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    statementId: "",
    sourceAccountId: "",
    currency: "",
    amount: "",
    occurredOn: today(),
  });

  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.kind === "ASSET"),
    [accounts]
  );
  const cardGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<LedgerAccount["group"]>>();
    for (const account of accounts) {
      if (account.group?.type === "CARD") groups.set(account.group.id, account.group);
    }
    return [...groups.values()];
  }, [accounts]);
  const selectedCardGroupId = cardGroups.some((group) => group.id === cardGroupId)
    ? cardGroupId
    : cardGroups[0]?.id ?? "";

  async function uploadStatement() {
    if (saving || !statementFile || !selectedCardGroupId) return;
    setSaving(true);
    setError("");
    try {
      const body = new FormData();
      body.set("cardGroupId", selectedCardGroupId);
      body.set("file", statementFile);
      const response = await fetch("/api/finance/v1/card-statements", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        throw new Error(responseBody?.error?.message ?? "No se pudo importar el resumen");
      }
      setStatementFile(null);
      setStatementFileKey((value) => value + 1);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo importar el resumen");
    } finally {
      setSaving(false);
    }
  }

  async function confirmStatement(statementId: string) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await postJson(`/api/finance/v1/card-statements/${statementId}/confirm`, {});
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo confirmar el resumen");
    } finally {
      setSaving(false);
    }
  }

  async function reverseStatement(statementId: string) {
    if (saving) return;
    const key = `reverse-statement:${statementId}`;
    if (warningKey !== key) {
      setWarningKey(key);
      setError("Revertir deshace los cargos del resumen, pero no vuelve a mover pagos bancarios. Volvé a confirmar para continuar.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await postJson(`/api/finance/v1/card-statements/${statementId}/reverse`, {
        occurredOn: today(),
      });
      setWarningKey("");
      setPaymentState(null);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo revertir el resumen");
    } finally {
      setSaving(false);
    }
  }

  async function saveProvisionalPurchase() {
    if (saving || !selectedCardGroupId) return;
    setSaving(true);
    setError("");
    try {
      await postJson("/api/finance/v1/card-provisionals", {
        ...provisionalForm,
        cardGroupId: provisionalForm.cardGroupId || selectedCardGroupId,
        idempotencyKey: crypto.randomUUID(),
      });
      setProvisionalForm((current) => ({ ...current, amount: "", description: "" }));
      setShowProvisionalForm(false);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el consumo manual");
    } finally {
      setSaving(false);
    }
  }

  async function openCardPayment(statement: CardStatement, currency: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/finance/v1/card-payments?statementId=${statement.id}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "No se pudo preparar el pago");
      }
      const state = await response.json() as CardPaymentState;
      const pending = state.currencies.find((item) => item.currency === currency)?.pending ?? "0.00";
      const source = assetAccounts.find((account) => account.currency === currency);
      setPaymentState(state);
      setPaymentForm({
        statementId: statement.id,
        sourceAccountId: source?.id ?? "",
        currency,
        amount: pending,
        occurredOn: today(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo preparar el pago");
    } finally {
      setSaving(false);
    }
  }

  async function saveCardPayment() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await postJson("/api/finance/v1/card-payments", {
        statementId: paymentForm.statementId,
        sourceAccountId: paymentForm.sourceAccountId,
        amount: paymentForm.amount,
        occurredOn: paymentForm.occurredOn,
        idempotencyKey: crypto.randomUUID(),
      });
      setPaymentState(null);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el pago");
    } finally {
      setSaving(false);
    }
  }

  async function allocateExistingPayment(journalEntryId: string, available: string) {
    if (saving || !paymentState) return;
    const pending = paymentState.currencies.find(
      (item) => item.currency === paymentForm.currency
    )?.pending ?? "0.00";
    const amount = Math.min(Number(available), Number(pending)).toFixed(2);
    setSaving(true);
    setError("");
    try {
      await postJson("/api/finance/v1/card-payments/allocate", {
        statementId: paymentForm.statementId,
        journalEntryId,
        amount,
      });
      setPaymentState(null);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo reasignar el pago");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resúmenes de tarjeta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {cardGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Creá una cuenta de tipo Tarjeta para habilitar la importación de resúmenes.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div>
              <Label htmlFor="statementCard">Tarjeta</Label>
              <select id="statementCard" className={selectClass()} value={selectedCardGroupId} onChange={(event) => setCardGroupId(event.target.value)}>
                {cardGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="statementPdf">Resumen PDF</Label>
              <Input key={statementFileKey} id="statementPdf" type="file" accept="application/pdf,.pdf" onChange={(event) => setStatementFile(event.target.files?.[0] ?? null)} />
            </div>
            <Button onClick={uploadStatement} disabled={saving || !statementFile}>
              {saving ? "Importando..." : "Subir resumen"}
            </Button>
            <Button className="sm:col-span-3" variant="outline" onClick={() => setShowProvisionalForm((value) => !value)}>
              {showProvisionalForm ? "Cancelar consumo manual" : "Cargar consumo manual con tarjeta"}
            </Button>
          </div>
        )}

        {showProvisionalForm && cardGroups.length > 0 && (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div><Label htmlFor="provisionalCard">Tarjeta</Label><select id="provisionalCard" className={selectClass()} value={provisionalForm.cardGroupId || selectedCardGroupId} onChange={(event) => setProvisionalForm({ ...provisionalForm, cardGroupId: event.target.value })}>{cardGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
            <div><Label htmlFor="provisionalCurrency">Moneda</Label><select id="provisionalCurrency" className={selectClass()} value={provisionalForm.currency} onChange={(event) => setProvisionalForm({ ...provisionalForm, currency: event.target.value })}><option>ARS</option><option>USD</option><option>AUD</option></select></div>
            <div><Label htmlFor="provisionalAmount">Importe</Label><Input id="provisionalAmount" inputMode="decimal" value={provisionalForm.amount} onChange={(event) => setProvisionalForm({ ...provisionalForm, amount: event.target.value })} /></div>
            <div><Label htmlFor="provisionalDate">Fecha</Label><Input id="provisionalDate" type="date" value={provisionalForm.occurredOn} onChange={(event) => setProvisionalForm({ ...provisionalForm, occurredOn: event.target.value })} /></div>
            <div><Label htmlFor="provisionalDescription">Descripción</Label><Input id="provisionalDescription" value={provisionalForm.description} onChange={(event) => setProvisionalForm({ ...provisionalForm, description: event.target.value })} /></div>
            <Button className="sm:col-span-2 lg:col-span-5" onClick={saveProvisionalPurchase} disabled={saving}>{saving ? "Guardando..." : "Guardar consumo provisional"}</Button>
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">Es informativo hasta que aparezca en un resumen; no descuenta dinero ni crea deuda facturada.</p>
          </div>
        )}

        {provisionals.filter((entry) => entry.status === "PROVISIONAL").length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Consumos no facturados</p>
            {provisionals.filter((entry) => entry.status === "PROVISIONAL").map((entry) => (
              <div key={entry.id} className="flex flex-wrap justify-between gap-2 rounded border p-2 text-sm">
                <span>{entry.occurredOn} · {entry.description}</span>
                <span className="tabular-nums">{entry.amount} {entry.currency}</span>
              </div>
            ))}
          </div>
        )}

        {statements.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay resúmenes importados. Subir un PDF crea un borrador y no cambia tus saldos.
          </p>
        )}
        {statements.map((statement) => (
          <details key={statement.id} className="rounded-md border p-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{statement.cardGroup.name} · cierre {statement.closingOn}</p>
                  <p className="text-xs text-muted-foreground">Vence {statement.dueOn} · revisión {statement.revision} · {statement.lines.length} líneas</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm tabular-nums">
                  {statement.totals.map((total) => (
                    <span key={total.currency} className="rounded bg-muted px-2 py-1">
                      {statement.status === "CONFIRMED" ? "Pendiente" : "A pagar"} {statement.status === "CONFIRMED" ? total.pendingTotal : total.payableTotal} {total.currency}
                    </span>
                  ))}
                  <span className="rounded border px-2 py-1">{statement.status === "DRAFT" ? "Borrador" : statement.status}</span>
                </div>
              </div>
            </summary>
            <div className="mt-3 space-y-3 border-t pt-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {statement.totals.map((total) => (
                  <div key={total.currency} className="rounded-md bg-muted/50 p-2 text-sm">
                    <p className="font-medium">{total.currency}: informado {total.reportedTotal}</p>
                    <p>Exclusiones {total.eligibleExclusions} · pagadero {total.payableTotal}</p>
                    {statement.status === "CONFIRMED" && <p>Pagado {total.paidTotal} · pendiente {total.pendingTotal}</p>}
                    <p className={Number(total.residual) === 0 ? "text-muted-foreground" : "text-destructive"}>Diferencia {total.residual}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {statement.lines.map((line) => (
                  <div key={line.id} className="grid gap-1 rounded border p-2 text-sm sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
                    <span className="text-muted-foreground">{line.purchaseOn ?? statement.closingOn}</span>
                    <span><span className="mr-2 text-xs text-muted-foreground">{line.classification}</span>{line.description}</span>
                    <span className="tabular-nums">{line.billedAmount} {line.billedCurrency}</span>
                  </div>
                ))}
              </div>
              {statement.status === "DRAFT" && <p className="text-xs text-muted-foreground">Este borrador todavía no afecta saldos ni deuda.</p>}
              <div className="flex flex-wrap gap-2">
                {statement.status === "DRAFT" && <Button onClick={() => confirmStatement(statement.id)} disabled={saving}>Confirmar resumen</Button>}
                {statement.status === "CONFIRMED" && statement.totals.filter((total) => Number(total.pendingTotal) > 0).map((total) => <Button key={total.currency} onClick={() => openCardPayment(statement, total.currency)} disabled={saving}>Pagar {total.currency}</Button>)}
                {statement.status === "CONFIRMED" && <Button variant="outline" onClick={() => reverseStatement(statement.id)} disabled={saving}>Revertir resumen</Button>}
              </div>
            </div>
          </details>
        ))}

        {paymentState && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="font-medium">Registrar pago en {paymentForm.currency}</p>
            {paymentState.unassignedPayments.filter((payment) => payment.currency === paymentForm.currency).map((payment) => (
              <div key={payment.journalEntryId} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 p-2 text-sm">
                <span>Pago existente del {payment.occurredOn}: {payment.available} {payment.currency}</span>
                <Button size="sm" variant="outline" onClick={() => allocateExistingPayment(payment.journalEntryId, payment.available)} disabled={saving}>Reasignar sin mover el banco</Button>
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label htmlFor="cardPaymentAccount">Cuenta de origen</Label><select id="cardPaymentAccount" className={selectClass()} value={paymentForm.sourceAccountId} onChange={(event) => setPaymentForm({ ...paymentForm, sourceAccountId: event.target.value })}>{assetAccounts.filter((account) => account.currency === paymentForm.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
              <div><Label htmlFor="cardPaymentAmount">Importe</Label><Input id="cardPaymentAmount" inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></div>
              <div><Label htmlFor="cardPaymentDate">Fecha</Label><Input id="cardPaymentDate" type="date" value={paymentForm.occurredOn} onChange={(event) => setPaymentForm({ ...paymentForm, occurredOn: event.target.value })} /></div>
              <div className="flex items-end gap-2"><Button onClick={saveCardPayment} disabled={saving || !paymentForm.sourceAccountId}>{saving ? "Guardando..." : "Registrar pago nuevo"}</Button><Button variant="ghost" onClick={() => setPaymentState(null)}>Cancelar</Button></div>
            </div>
            <p className="text-xs text-muted-foreground">Un pago nuevo baja la cuenta bancaria. Si aparece un pago existente arriba, reasignalo para evitar descontarlo dos veces.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
