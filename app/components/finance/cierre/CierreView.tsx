"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardStatementsSection } from "./CardStatementsSection";
import { MovementsList } from "./MovementsList";
import { ObligationsSection } from "./ObligationsSection";
import { RegisterMovementSection } from "./RegisterMovementSection";
import {
  CardProvisional,
  CardStatement,
  LedgerAccount,
  LedgerMovement,
  Overview,
  Region,
  nativeLabel,
  postJson,
  selectClass,
  today,
  valueLabel,
} from "./shared";

export function CierreView() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [movements, setMovements] = useState<LedgerMovement[]>([]);
  const [statements, setStatements] = useState<CardStatement[]>([]);
  const [provisionals, setProvisionals] = useState<CardProvisional[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [region, setRegion] = useState<Region>("GLOBAL");
  const [showRateForm, setShowRateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rateForm, setRateForm] = useState({
    quoteCurrency: "ARS",
    rate: "",
    appliedOn: today(),
  });

  const load = useCallback(async () => {
    const [accountsResponse, movementsResponse, overviewResponse, statementsResponse, provisionalsResponse] = await Promise.all([
      fetch("/api/finance/v1/accounts"),
      fetch("/api/finance/v1/movements"),
      fetch(`/api/finance/v1/overview?region=${region}`),
      fetch("/api/finance/v1/card-statements"),
      fetch("/api/finance/v1/card-provisionals"),
    ]);
    if (!accountsResponse.ok || !movementsResponse.ok || !overviewResponse.ok || !statementsResponse.ok || !provisionalsResponse.ok) {
      throw new Error("No se pudieron cargar las finanzas v1");
    }
    setAccounts(await accountsResponse.json());
    setMovements(await movementsResponse.json());
    setOverview(await overviewResponse.json());
    setStatements(await statementsResponse.json());
    setProvisionals(await provisionalsResponse.json());
  }, [region]);

  useEffect(() => {
    // The loader updates state only after its network requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar los datos."));
  }, [load]);

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
          <select id="financeRegion" className={selectClass()} value={region} onChange={(event) => { setRegion(event.target.value as Region); setError(""); }}>
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Dinero disponible</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.liquid)}</p><p className="text-xs text-muted-foreground">{nativeLabel(overview.native.liquid)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Deuda facturada</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.billedCardDebt)}</p><p className="text-xs text-muted-foreground">{nativeLabel(overview.native.billedCardDebt)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Consumos no facturados</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.unbilledCardDebt)}</p><p className="text-xs text-muted-foreground">{nativeLabel(overview.native.unbilledCardDebt)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Posición neta confirmada</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.confirmedNet)}</p><p className="text-xs text-muted-foreground">Sin proyectar consumos no facturados</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Posición neta proyectada</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.projectedNet)}</p><p className="text-xs text-muted-foreground">Descuenta consumos todavía no facturados</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Después de pagar lo facturado</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.afterBilled)}</p><p className="text-xs text-muted-foreground">{nativeLabel(overview.native.afterBilled)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Después de pagar todo</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.afterAll)}</p><p className="text-xs text-muted-foreground">{nativeLabel(overview.native.afterAll)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Flujo del mes</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums">{valueLabel(overview.consolidated.flow)}</p><p className="text-xs text-muted-foreground">Ingresos − gastos; no incluye transferencias ni FX</p></CardContent></Card>
        </div>
      )}

      {overview && overview.cardProjection.byCurrency.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Proyección de pago de tarjeta</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {overview.cardProjection.byCurrency.map((item) => (
                <div key={item.currency} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{item.currency}</p>
                  <p>Disponible {item.available} · deuda {item.billedDebt}</p>
                  <p>No facturado {item.unbilled}</p>
                  <p className={Number(item.afterBilled) < 0 ? "text-destructive" : ""}>Después de facturado {item.afterBilled}</p>
                  <p className={Number(item.afterAll) < 0 ? "text-destructive" : ""}>Después de todo {item.afterAll}</p>
                </div>
              ))}
            </div>
            {Number(overview.cardProjection.usdPurchase.shortfallUsd) > 0 && (
              <p className="text-sm">
                Faltan {overview.cardProjection.usdPurchase.shortfallUsd} USD.
                {overview.cardProjection.usdPurchase.arsRequired
                  ? ` Comprar ese monto requiere aproximadamente ${overview.cardProjection.usdPurchase.arsRequired} ARS al tipo de cambio cargado.`
                  : " Cargá una cotización ARS para calcular cuánto necesitás comprar."}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Esta proyección no mueve dinero, no reserva fondos y no cambia el estado de ningún resumen.</p>
          </CardContent>
        </Card>
      )}

      <CardStatementsSection
        accounts={accounts}
        statements={statements}
        provisionals={provisionals}
        onChanged={load}
      />

      <ObligationsSection accounts={accounts} onLedgerChanged={load} />

      <RegisterMovementSection accounts={accounts} region={region} onSaved={load} />

      <MovementsList movements={visibleMovements} />
    </div>
  );
}
