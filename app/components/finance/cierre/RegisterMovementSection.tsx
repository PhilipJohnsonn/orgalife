"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LedgerAccount, Region, postJson, selectClass, today } from "./shared";

export function RegisterMovementSection({
  accounts,
  region,
  onSaved,
}: {
  accounts: LedgerAccount[];
  region: Region;
  onSaved: () => Promise<void>;
}) {
  const [operationType, setOperationType] = useState<"INCOME" | "EXPENSE" | "TRANSFER" | "FX">("EXPENSE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warningKey, setWarningKey] = useState("");
  const [flowForm, setFlowForm] = useState({
    accountId: "",
    amount: "",
    occurredOn: today(),
    description: "",
  });
  const [transferForm, setTransferForm] = useState({
    sourceAccountId: "",
    destinationAccountId: "",
    amount: "",
    occurredOn: today(),
    description: "",
  });
  const [fxForm, setFxForm] = useState({
    sourceAccountId: "",
    destinationAccountId: "",
    sourceAmount: "",
    destinationAmount: "",
    occurredOn: today(),
    description: "",
  });

  const assetAccounts = useMemo(
    () => accounts.filter((account) => account.kind === "ASSET"),
    [accounts]
  );
  const operableAccounts = useMemo(
    () =>
      region === "GLOBAL"
        ? assetAccounts
        : assetAccounts.filter((account) => account.group?.region === region),
    [assetAccounts, region]
  );
  const flowAccountId =
    (operableAccounts.some((account) => account.id === flowForm.accountId)
      ? flowForm.accountId
      : operableAccounts[0]?.id) || "";
  const requestedSourceId =
    operationType === "FX" ? fxForm.sourceAccountId : transferForm.sourceAccountId;
  const sourceId =
    (operableAccounts.some((account) => account.id === requestedSourceId)
      ? requestedSourceId
      : operableAccounts[0]?.id) || "";
  const sourceAccount = operableAccounts.find((account) => account.id === sourceId);
  const destinationCandidates = operableAccounts.filter((account) => {
    if (!sourceAccount || account.id === sourceAccount.id) return false;
    return operationType === "FX"
      ? account.currency !== sourceAccount.currency
      : account.currency === sourceAccount.currency;
  });
  const requestedDestinationId =
    operationType === "FX" ? fxForm.destinationAccountId : transferForm.destinationAccountId;
  const destinationId = destinationCandidates.some(
    (account) => account.id === requestedDestinationId
  )
    ? requestedDestinationId
    : destinationCandidates[0]?.id || "";

  function negativeBalanceNeedsConfirmation(amount: string) {
    if (!sourceAccount || Number(sourceAccount.balance) >= Number(amount)) return false;
    const key = `${operationType}:${sourceId}:${destinationId}:${amount}`;
    if (warningKey === key) return false;
    setWarningKey(key);
    setError(
      `La cuenta ${sourceAccount.name} quedará negativa. Revisá el importe y volvé a confirmar para registrarlo igual.`
    );
    return true;
  }

  async function saveMovement() {
    if (saving) return;
    if (
      operationType === "TRANSFER" &&
      negativeBalanceNeedsConfirmation(transferForm.amount)
    ) return;
    if (
      operationType === "FX" &&
      negativeBalanceNeedsConfirmation(fxForm.sourceAmount)
    ) return;

    setSaving(true);
    setError("");
    try {
      const idempotencyKey = crypto.randomUUID();
      if (operationType === "INCOME" || operationType === "EXPENSE") {
        await postJson("/api/finance/v1/transactions", {
          type: operationType,
          ...flowForm,
          accountId: flowAccountId,
          idempotencyKey,
        });
        setFlowForm((current) => ({ ...current, amount: "", description: "" }));
      } else if (operationType === "TRANSFER") {
        await postJson("/api/finance/v1/transfers", {
          ...transferForm,
          sourceAccountId: sourceId,
          destinationAccountId: destinationId,
          idempotencyKey,
        });
        setTransferForm((current) => ({ ...current, amount: "", description: "" }));
      } else {
        await postJson("/api/finance/v1/fx", {
          ...fxForm,
          sourceAccountId: sourceId,
          destinationAccountId: destinationId,
          idempotencyKey,
        });
        setFxForm((current) => ({
          ...current,
          sourceAmount: "",
          destinationAmount: "",
          description: "",
        }));
      }
      setWarningKey("");
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  const sourceAmount = Number(fxForm.sourceAmount);
  const destinationAmount = Number(fxForm.destinationAmount);
  const fxHint =
    sourceAccount &&
    destinationCandidates.find((account) => account.id === destinationId) &&
    sourceAmount > 0 &&
    destinationAmount > 0
      ? `1 ${destinationCandidates.find((account) => account.id === destinationId)!.currency} = ${(sourceAmount / destinationAmount).toFixed(4)} ${sourceAccount.currency}`
      : "";

  if (operableAccounts.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Registrar movimiento</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2 lg:col-span-5">
            {error}
          </p>
        )}
        <div><Label htmlFor="operationType">Tipo</Label><select id="operationType" className={selectClass()} value={operationType} onChange={(event) => { setOperationType(event.target.value as typeof operationType); setWarningKey(""); setError(""); }}><option value="EXPENSE">Gasto</option><option value="INCOME">Ingreso</option><option value="TRANSFER">Transferencia</option><option value="FX">Conversión FX</option></select></div>

        {(operationType === "INCOME" || operationType === "EXPENSE") && <>
          <div><Label htmlFor="flowAccount">Cuenta</Label><select id="flowAccount" className={selectClass()} value={flowAccountId} onChange={(event) => setFlowForm({ ...flowForm, accountId: event.target.value })}>{operableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></div>
          <div><Label htmlFor="flowAmount">Importe</Label><Input id="flowAmount" inputMode="decimal" value={flowForm.amount} onChange={(event) => setFlowForm({ ...flowForm, amount: event.target.value })} /></div>
          <div><Label htmlFor="flowDate">Fecha</Label><Input id="flowDate" type="date" value={flowForm.occurredOn} onChange={(event) => setFlowForm({ ...flowForm, occurredOn: event.target.value })} /></div>
          <div><Label htmlFor="flowDescription">Descripción</Label><Input id="flowDescription" value={flowForm.description} onChange={(event) => setFlowForm({ ...flowForm, description: event.target.value })} /></div>
        </>}

        {operationType === "TRANSFER" && <>
          <div><Label htmlFor="transferSource">Origen</Label><select id="transferSource" className={selectClass()} value={sourceId} onChange={(event) => setTransferForm({ ...transferForm, sourceAccountId: event.target.value, destinationAccountId: "" })}>{operableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></div>
          <div><Label htmlFor="transferDestination">Destino</Label><select id="transferDestination" className={selectClass()} value={destinationId} onChange={(event) => setTransferForm({ ...transferForm, destinationAccountId: event.target.value })}>{destinationCandidates.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
          <div><Label htmlFor="transferAmount">Importe</Label><Input id="transferAmount" inputMode="decimal" value={transferForm.amount} onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })} /></div>
          <div><Label htmlFor="transferDate">Fecha</Label><Input id="transferDate" type="date" value={transferForm.occurredOn} onChange={(event) => setTransferForm({ ...transferForm, occurredOn: event.target.value })} /></div>
          <div className="sm:col-span-2 lg:col-span-5"><Label htmlFor="transferDescription">Descripción</Label><Input id="transferDescription" value={transferForm.description} onChange={(event) => setTransferForm({ ...transferForm, description: event.target.value })} /></div>
        </>}

        {operationType === "FX" && <>
          <div><Label htmlFor="fxSource">Origen</Label><select id="fxSource" className={selectClass()} value={sourceId} onChange={(event) => setFxForm({ ...fxForm, sourceAccountId: event.target.value, destinationAccountId: "" })}>{operableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></div>
          <div><Label htmlFor="fxDestination">Destino</Label><select id="fxDestination" className={selectClass()} value={destinationId} onChange={(event) => setFxForm({ ...fxForm, destinationAccountId: event.target.value })}>{destinationCandidates.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
          <div><Label htmlFor="fxSourceAmount">Entrego</Label><Input id="fxSourceAmount" inputMode="decimal" value={fxForm.sourceAmount} onChange={(event) => setFxForm({ ...fxForm, sourceAmount: event.target.value })} /></div>
          <div><Label htmlFor="fxDestinationAmount">Recibo</Label><Input id="fxDestinationAmount" inputMode="decimal" value={fxForm.destinationAmount} onChange={(event) => setFxForm({ ...fxForm, destinationAmount: event.target.value })} /></div>
          <div><Label htmlFor="fxDate">Fecha</Label><Input id="fxDate" type="date" value={fxForm.occurredOn} onChange={(event) => setFxForm({ ...fxForm, occurredOn: event.target.value })} /></div>
          <div className="sm:col-span-2 lg:col-span-5"><Label htmlFor="fxDescription">Descripción</Label><Input id="fxDescription" value={fxForm.description} onChange={(event) => setFxForm({ ...fxForm, description: event.target.value })} />{fxHint && <p className="mt-1 text-xs text-muted-foreground">Tipo efectivo: {fxHint}</p>}</div>
        </>}

        <Button className="sm:col-span-2 lg:col-span-5" onClick={saveMovement} disabled={saving || ((operationType === "TRANSFER" || operationType === "FX") && !destinationId)}>{saving ? "Guardando..." : "Registrar movimiento"}</Button>
      </CardContent>
    </Card>
  );
}
