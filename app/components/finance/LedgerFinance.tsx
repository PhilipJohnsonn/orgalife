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
  group: {
    id: string;
    name: string;
    region: "ARGENTINA" | "AUSTRALIA" | "GLOBAL";
    type: "BANK" | "WALLET" | "CARD" | "OTHER";
  } | null;
};

type CardStatement = {
  id: string;
  cardGroup: { id: string; name: string; region: string };
  closingOn: string;
  dueOn: string;
  revision: number;
  status: "DRAFT" | "CONFIRMED" | "REVERSED";
  totals: {
    currency: string;
    reportedTotal: string;
    eligibleExclusions: string;
    payableTotal: string;
    residual: string;
  }[];
  lines: {
    id: string;
    purchaseOn: string | null;
    description: string;
    classification: string;
    paymentTreatment: string;
    billedCurrency: string;
    billedAmount: string;
    originalCurrency: string | null;
    originalAmount: string | null;
  }[];
};

type MovementAccount = {
  id: string;
  name: string;
  currency: string;
  amount: string;
  region: "ARGENTINA" | "AUSTRALIA" | "GLOBAL";
};

type LedgerMovement = {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "FX";
  occurredOn: string;
  description: string;
  source: MovementAccount | null;
  destination: MovementAccount | null;
  effectiveRate: string | null;
};

type Overview = {
  baseCurrency: string;
  consolidated: {
    liquid: ConsolidatedValue;
    confirmedNet: ConsolidatedValue;
    flow: ConsolidatedValue;
  };
  native: {
    liquid: { currency: string; amount: string }[];
  };
  rates: {
    quoteCurrency: string;
    rate: string;
    provider: string;
    stale: boolean;
    isManualOverride: boolean;
  }[];
};

type ConsolidatedValue = {
  currency: string;
  value: string | null;
  incomplete: boolean;
  missingCurrencies: string[];
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function selectClass() {
  return "h-9 w-full rounded-md border bg-background px-3 text-sm";
}

function valueLabel(value: ConsolidatedValue) {
  return value.value === null
    ? `Incompleto (${value.missingCurrencies.join(", ")})`
    : `${value.value} ${value.currency}`;
}

export function LedgerFinance() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [movements, setMovements] = useState<LedgerMovement[]>([]);
  const [statements, setStatements] = useState<CardStatement[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [region, setRegion] = useState<"ARGENTINA" | "AUSTRALIA" | "GLOBAL">("GLOBAL");
  const [operationType, setOperationType] = useState<"INCOME" | "EXPENSE" | "TRANSFER" | "FX">("EXPENSE");
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warningKey, setWarningKey] = useState("");
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [statementFileKey, setStatementFileKey] = useState(0);
  const [cardGroupId, setCardGroupId] = useState("");
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
  const [rateForm, setRateForm] = useState({
    quoteCurrency: "ARS",
    rate: "",
    appliedOn: today(),
  });

  const load = useCallback(async () => {
    const [accountsResponse, movementsResponse, overviewResponse, statementsResponse] = await Promise.all([
      fetch("/api/finance/v1/accounts"),
      fetch("/api/finance/v1/movements"),
      fetch(`/api/finance/v1/overview?region=${region}`),
      fetch("/api/finance/v1/card-statements"),
    ]);
    if (!accountsResponse.ok || !movementsResponse.ok || !overviewResponse.ok || !statementsResponse.ok) {
      throw new Error("No se pudieron cargar las finanzas v1");
    }
    setAccounts(await accountsResponse.json());
    setMovements(await movementsResponse.json());
    setOverview(await overviewResponse.json());
    setStatements(await statementsResponse.json());
  }, [region]);

  useEffect(() => {
    // The loader updates state only after its network requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar los datos."));
  }, [load]);

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
  const visibleAccounts = useMemo(
    () =>
      region === "GLOBAL"
        ? accounts
        : accounts.filter((account) => account.group?.region === region),
    [accounts, region]
  );
  const operableAccounts = useMemo(
    () =>
      region === "GLOBAL"
        ? assetAccounts
        : assetAccounts.filter((account) => account.group?.region === region),
    [assetAccounts, region]
  );
  const visibleMovements = useMemo(
    () =>
      region === "GLOBAL"
        ? movements
        : movements.filter(
            (movement) =>
              movement.source?.region === region ||
              movement.destination?.region === region
          ),
    [movements, region]
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

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const responseBody = await response.json().catch(() => null);
      throw new Error(responseBody?.error?.message ?? "No se pudo guardar");
    }
  }

  async function saveAccount() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await postJson("/api/finance/v1/accounts", accountForm);
      setAccountForm((current) => ({
        ...current,
        groupName: "",
        accountName: "",
        openingBalance: "0.00",
      }));
      setShowAccountForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la cuenta");
    } finally {
      setSaving(false);
    }
  }

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
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
    }
  }

  async function changeBaseCurrency(baseCurrency: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/v1/configuration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseCurrency }),
      });
      if (!response.ok) throw new Error("No se pudo cambiar la moneda base");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar la moneda base");
    } finally {
      setSaving(false);
    }
  }

  async function saveRate() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await postJson("/api/finance/v1/rates", rateForm);
      setRateForm((current) => ({ ...current, rate: "" }));
      setShowRateForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la cotización");
    } finally {
      setSaving(false);
    }
  }

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
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo importar el resumen");
    } finally {
      setSaving(false);
    }
  }

  function movementSummary(movement: LedgerMovement) {
    if (movement.type === "INCOME" && movement.destination) {
      return `+${movement.destination.amount} ${movement.destination.currency} · ${movement.destination.name}`;
    }
    if (movement.type === "EXPENSE" && movement.source) {
      return `−${movement.source.amount} ${movement.source.currency} · ${movement.source.name}`;
    }
    if (movement.source && movement.destination) {
      return movement.type === "FX"
        ? `${movement.source.amount} ${movement.source.currency} → ${movement.destination.amount} ${movement.destination.currency}`
        : `${movement.source.amount} ${movement.source.currency} · ${movement.source.name} → ${movement.destination.name}`;
    }
    return "Movimiento sin detalle";
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

  return (
    <div className="min-w-0 space-y-4">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="financeRegion">Vista</Label>
          <select id="financeRegion" className={selectClass()} value={region} onChange={(event) => { setRegion(event.target.value as typeof region); setError(""); }}>
            <option value="GLOBAL">Global</option>
            <option value="ARGENTINA">Argentina</option>
            <option value="AUSTRALIA">Australia</option>
          </select>
        </div>
        <div>
          <Label htmlFor="baseCurrency">Moneda base</Label>
          <select id="baseCurrency" className={selectClass()} value={overview?.baseCurrency ?? "USD"} onChange={(event) => changeBaseCurrency(event.target.value)} disabled={saving}>
            <option value="USD">USD</option>
            <option value="AUD">AUD</option>
          </select>
        </div>
        <Button variant="outline" onClick={() => setShowRateForm((value) => !value)}>
          {showRateForm ? "Cancelar cotización" : "Cargar cotización"}
        </Button>
      </div>

      {showRateForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cotización manual contra USD</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="rateCurrency">Moneda</Label><select id="rateCurrency" className={selectClass()} value={rateForm.quoteCurrency} onChange={(event) => setRateForm({ ...rateForm, quoteCurrency: event.target.value })}><option>ARS</option><option>AUD</option></select></div>
            <div><Label htmlFor="rateValue">1 USD equivale a</Label><Input id="rateValue" inputMode="decimal" value={rateForm.rate} onChange={(event) => setRateForm({ ...rateForm, rate: event.target.value })} /></div>
            <div><Label htmlFor="rateDate">Fecha</Label><Input id="rateDate" type="date" value={rateForm.appliedOn} onChange={(event) => setRateForm({ ...rateForm, appliedOn: event.target.value })} /></div>
            <Button className="sm:col-span-3" onClick={saveRate} disabled={saving}>{saving ? "Guardando..." : "Guardar cotización"}</Button>
          </CardContent>
        </Card>
      )}

      {overview && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Dinero disponible</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.liquid)}</p><p className="text-xs text-muted-foreground">{overview.native.liquid.map((item) => `${item.amount} ${item.currency}`).join(" · ") || "Sin saldos"}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Posición neta confirmada</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.confirmedNet)}</p><p className="text-xs text-muted-foreground">Sin proyectar consumos no facturados</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Flujo del mes</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.flow)}</p><p className="text-xs text-muted-foreground">Ingresos − gastos; no incluye transferencias ni FX</p></CardContent></Card>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleAccounts.map((account) => (
          <Card key={account.id} className={Number(account.balance) < 0 ? "border-destructive" : ""}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{account.name}</CardTitle></CardHeader>
            <CardContent>
              <p className={`text-2xl font-semibold tabular-nums ${Number(account.balance) < 0 ? "text-destructive" : ""}`}>{account.balance} {account.currency}</p>
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
            <div><Label htmlFor="region">Región</Label><select id="region" className={selectClass()} value={accountForm.region} onChange={(event) => setAccountForm({ ...accountForm, region: event.target.value })}><option value="ARGENTINA">Argentina</option><option value="AUSTRALIA">Australia</option><option value="GLOBAL">Global</option></select></div>
            <div><Label htmlFor="groupType">Tipo</Label><select id="groupType" className={selectClass()} value={accountForm.groupType} onChange={(event) => setAccountForm({ ...accountForm, groupType: event.target.value })}><option value="BANK">Banco</option><option value="WALLET">Billetera</option><option value="CARD">Tarjeta</option><option value="OTHER">Otra</option></select></div>
            <div><Label htmlFor="currency">Moneda</Label><select id="currency" className={selectClass()} value={accountForm.currency} onChange={(event) => setAccountForm({ ...accountForm, currency: event.target.value })}><option>ARS</option><option>USD</option><option>AUD</option></select></div>
            <div><Label htmlFor="trackingMode">Seguimiento</Label><select id="trackingMode" className={selectClass()} value={accountForm.trackingMode} onChange={(event) => setAccountForm({ ...accountForm, trackingMode: event.target.value })}><option value="TRANSACTIONAL">Transaccional</option><option value="DECLARED">Declarado</option></select></div>
            <div><Label htmlFor="openingBalance">Saldo actual</Label><Input id="openingBalance" inputMode="decimal" value={accountForm.openingBalance} onChange={(event) => setAccountForm({ ...accountForm, openingBalance: event.target.value })} /></div>
            <div><Label htmlFor="openingOn">Fecha del saldo</Label><Input id="openingOn" type="date" value={accountForm.openingOn} onChange={(event) => setAccountForm({ ...accountForm, openingOn: event.target.value })} /></div>
            <Button className="sm:col-span-2 lg:col-span-4" onClick={saveAccount} disabled={saving}>{saving ? "Guardando..." : "Guardar cuenta"}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resúmenes de tarjeta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                        A pagar {total.payableTotal} {total.currency}
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
              </div>
            </details>
          ))}
        </CardContent>
      </Card>

      {operableAccounts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Registrar movimiento</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
              <div><Label htmlFor="fxDestination">Destino</Label><select id="fxDestination" className={selectClass()} value={destinationId} onChange={(event) => setFxForm({ ...fxForm, destinationAccountId: event.target.value })}>{destinationCandidates.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}</select></div>
              <div><Label htmlFor="fxSourceAmount">Entrego</Label><Input id="fxSourceAmount" inputMode="decimal" value={fxForm.sourceAmount} onChange={(event) => setFxForm({ ...fxForm, sourceAmount: event.target.value })} /></div>
              <div><Label htmlFor="fxDestinationAmount">Recibo</Label><Input id="fxDestinationAmount" inputMode="decimal" value={fxForm.destinationAmount} onChange={(event) => setFxForm({ ...fxForm, destinationAmount: event.target.value })} /></div>
              <div><Label htmlFor="fxDate">Fecha</Label><Input id="fxDate" type="date" value={fxForm.occurredOn} onChange={(event) => setFxForm({ ...fxForm, occurredOn: event.target.value })} /></div>
              <div className="sm:col-span-2 lg:col-span-5"><Label htmlFor="fxDescription">Descripción</Label><Input id="fxDescription" value={fxForm.description} onChange={(event) => setFxForm({ ...fxForm, description: event.target.value })} />{fxHint && <p className="mt-1 text-xs text-muted-foreground">Tipo efectivo: {fxHint}</p>}</div>
            </>}

            <Button className="sm:col-span-2 lg:col-span-5" onClick={saveMovement} disabled={saving || ((operationType === "TRANSFER" || operationType === "FX") && !destinationId)}>{saving ? "Guardando..." : "Registrar movimiento"}</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Movimientos confirmados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {visibleMovements.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay movimientos en esta vista.</p>}
          {visibleMovements.map((movement) => (
            <div key={movement.id} className="grid gap-1 rounded-md border p-3 text-sm sm:grid-cols-[6rem_1fr_auto] sm:items-center sm:gap-3">
              <span className="text-muted-foreground">{movement.occurredOn}</span>
              <span><span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">{movement.type}</span>{movement.description}</span>
              <span className="tabular-nums">{movementSummary(movement)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
