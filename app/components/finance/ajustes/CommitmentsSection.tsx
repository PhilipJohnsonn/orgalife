"use client";

import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LedgerAccount, requestJson, selectClass, today } from "@/app/components/finance/cierre/shared";
import { cn } from "@/lib/utils";
import { computeCommitmentEndsOn } from "@/app/lib/finance-commitment-dates";
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

type EndsMode = "never" | "date" | "afterN";

const FREQUENCY_LABELS: Record<Commitment["frequency"], string> = {
  ONCE: "Una vez",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
};

const STATUS_LABELS: Record<Commitment["status"], string> = {
  ACTIVE: "Activa",
  CANCELLED: "Cancelada",
};

const ENDS_OPTIONS: { value: EndsMode; label: string }[] = [
  { value: "never", label: "Nunca" },
  { value: "date", label: "En una fecha" },
  { value: "afterN", label: "Después de N pagos" },
];

function emptyCommitmentForm() {
  return {
    name: "",
    expectedAmount: "",
    currency: "ARS",
    frequency: "MONTHLY" as Commitment["frequency"],
    startsOn: today(),
    expectedAccountId: "",
  };
}

function formatCivilDateEs(civilDate: string) {
  return new Date(`${civilDate}T00:00:00Z`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

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
  const [commitmentLines, setCommitmentLines] = useState<Record<string, string>>({});

  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [commitmentForm, setCommitmentForm] = useState(emptyCommitmentForm);
  const [endsMode, setEndsMode] = useState<EndsMode>("never");
  const [endsDate, setEndsDate] = useState("");
  const [endsAfterCount, setEndsAfterCount] = useState("");

  const [cancelling, setCancelling] = useState<Commitment | null>(null);
  const [cancelError, setCancelError] = useState("");

  const load = useCallback(async () => {
    const body = await requestJson("/api/finance/v1/commitments");
    setCommitments(body.commitments);
    setCommitmentTotals(body.totals);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar los compromisos."));
  }, [load]);

  function closeForm() {
    setCommitmentForm(emptyCommitmentForm());
    setEndsMode("never");
    setEndsDate("");
    setEndsAfterCount("");
    setFormError("");
    setShowForm(false);
  }

  function computeFinalEndsOn(): string | undefined {
    if (commitmentForm.frequency === "ONCE") return undefined;
    if (endsMode === "date") return endsDate || undefined;
    if (endsMode === "afterN") {
      const count = Math.floor(Number(endsAfterCount));
      if (!Number.isFinite(count) || count < 1) return undefined;
      return computeCommitmentEndsOn(commitmentForm.frequency, commitmentForm.startsOn, count);
    }
    return undefined;
  }

  const endsOnHint =
    commitmentForm.frequency !== "ONCE" && endsMode !== "never" ? computeFinalEndsOn() : undefined;

  async function saveCommitment() {
    setSaving(true);
    setFormError("");
    try {
      await requestJson("/api/finance/v1/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...commitmentForm,
          endsOn: computeFinalEndsOn(),
          expectedAccountId: commitmentForm.expectedAccountId || undefined,
        }),
      });
      closeForm();
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "No se pudo guardar el compromiso");
    } finally {
      setSaving(false);
    }
  }

  function closeCancelDialog() {
    setCancelling(null);
    setCancelError("");
  }

  async function confirmCancel() {
    if (!cancelling || saving) return;
    setSaving(true);
    setCancelError("");
    try {
      await requestJson(`/api/finance/v1/commitments/${cancelling.id}`, { method: "DELETE" });
      closeCancelDialog();
      await load();
    } catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : "No se pudo cancelar la suscripción");
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
        <div className="flex flex-wrap gap-2 text-sm">
          {commitmentTotals.map((total) => (
            <span key={total.currency} className="rounded bg-muted px-2 py-1">
              {total.currency}: semanal {total.weekly} · mensual {total.monthly} · promedio mensual {total.monthlyAverage}
            </span>
          ))}
        </div>

        <Button variant="outline" className="min-h-11" onClick={() => setShowForm(true)}>Agregar suscripción</Button>

        {commitments.map((commitment) => {
          const eligible = purchaseLines.filter(
            (line) =>
              line.statementStatus === "CONFIRMED" &&
              line.billedCurrency === commitment.currency &&
              !commitment.observedLineIds.includes(line.id)
          );
          return (
            <div key={commitment.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{commitment.name}</strong> · {commitment.expectedAmount} {commitment.currency} · {FREQUENCY_LABELS[commitment.frequency]}
                </span>
                <div className="flex items-center gap-1">
                  <span>
                    {STATUS_LABELS[commitment.status]}
                    {commitment.difference !== null ? ` · diferencia ${commitment.difference}` : " · sin cargo observado"}
                  </span>
                  {commitment.status === "ACTIVE" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-11" aria-label={`Acciones de ${commitment.name}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onSelect={() => setCancelling(commitment)}>
                          Cancelar suscripción
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              {commitment.status === "ACTIVE" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <select
                    aria-label={`Cargo observado para ${commitment.name}`}
                    className={selectClass()}
                    value={commitmentLines[commitment.id] ?? ""}
                    onChange={(event) => setCommitmentLines({ ...commitmentLines, [commitment.id]: event.target.value })}
                  >
                    <option value="">Vincular un consumo real…</option>
                    {eligible.map((line) => <option key={line.id} value={line.id}>{line.closingOn} · {line.description} · {line.billedAmount}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={() => linkCommitment(commitment)} disabled={saving || !commitmentLines[commitment.id]}>Vincular</Button>
                </div>
              )}
            </div>
          );
        })}

        <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : closeForm())}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nueva suscripción</DialogTitle>
              <DialogDescription>Es informativo: no descuenta dinero ni duplica el consumo que después aparece en la tarjeta.</DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveCommitment();
              }}
            >
              {formError && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">
                  {formError}
                </p>
              )}
              <div>
                <Label htmlFor="commitmentName">Nombre</Label>
                <Input id="commitmentName" value={commitmentForm.name} onChange={(event) => setCommitmentForm({ ...commitmentForm, name: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="commitmentAmount">Importe esperado</Label>
                <Input id="commitmentAmount" inputMode="decimal" value={commitmentForm.expectedAmount} onChange={(event) => setCommitmentForm({ ...commitmentForm, expectedAmount: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="commitmentCurrency">Moneda</Label>
                <select
                  id="commitmentCurrency"
                  className={selectClass()}
                  value={commitmentForm.currency}
                  onChange={(event) => setCommitmentForm({ ...commitmentForm, currency: event.target.value, expectedAccountId: "" })}
                >
                  <option>ARS</option><option>USD</option><option>AUD</option>
                </select>
              </div>
              <div>
                <Label htmlFor="commitmentFrequency">Frecuencia</Label>
                <select
                  id="commitmentFrequency"
                  className={selectClass()}
                  value={commitmentForm.frequency}
                  onChange={(event) => setCommitmentForm({ ...commitmentForm, frequency: event.target.value as Commitment["frequency"] })}
                >
                  <option value="ONCE">Una vez</option>
                  <option value="WEEKLY">Semanal</option>
                  <option value="MONTHLY">Mensual</option>
                </select>
              </div>
              <div>
                <Label htmlFor="commitmentStart">Comienza</Label>
                <Input id="commitmentStart" type="date" value={commitmentForm.startsOn} onChange={(event) => setCommitmentForm({ ...commitmentForm, startsOn: event.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="commitmentAccount">Cuenta o tarjeta esperada</Label>
                <select
                  id="commitmentAccount"
                  className={selectClass()}
                  value={commitmentForm.expectedAccountId}
                  onChange={(event) => setCommitmentForm({ ...commitmentForm, expectedAccountId: event.target.value })}
                >
                  <option value="">Sin especificar</option>
                  {accounts.filter((account) => account.currency === commitmentForm.currency).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </div>

              {commitmentForm.frequency !== "ONCE" && (
                <div className="sm:col-span-2">
                  <Label>Termina</Label>
                  <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Termina">
                    {ENDS_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                          endsMode === option.value
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <input
                          type="radio"
                          name="commitmentEndsMode"
                          value={option.value}
                          checked={endsMode === option.value}
                          onChange={() => setEndsMode(option.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  {endsMode === "date" && (
                    <Input
                      type="date"
                      aria-label="Fecha de finalización"
                      className="mt-2"
                      min={commitmentForm.startsOn}
                      value={endsDate}
                      onChange={(event) => setEndsDate(event.target.value)}
                    />
                  )}
                  {endsMode === "afterN" && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        aria-label="Cantidad de pagos"
                        className="w-24"
                        value={endsAfterCount}
                        onChange={(event) => setEndsAfterCount(event.target.value)}
                      />
                      <span className="text-sm text-muted-foreground">pagos</span>
                    </div>
                  )}
                  {endsOnHint && <p className="mt-1 text-xs text-muted-foreground">Último pago: {formatCivilDateEs(endsOnHint)}</p>}
                </div>
              )}

              <DialogFooter className="sm:col-span-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={closeForm}>Cancelar</Button>
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={
                    saving ||
                    !commitmentForm.name.trim() ||
                    !commitmentForm.expectedAmount.trim() ||
                    (endsMode === "date" && !endsDate) ||
                    (endsMode === "afterN" && !(Math.floor(Number(endsAfterCount)) >= 1))
                  }
                >
                  {saving ? "Guardando..." : "Guardar suscripción"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={cancelling !== null} onOpenChange={(open) => (open ? null : closeCancelDialog())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar suscripción</DialogTitle>
              <DialogDescription>
                {cancelling ? `Se va a cancelar "${cancelling.name}". Vas a poder ver el historial, pero no vas a poder reactivarla.` : ""}
              </DialogDescription>
            </DialogHeader>
            {cancelError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {cancelError}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={closeCancelDialog}>Volver</Button>
              <Button variant="destructive" className="min-h-11" onClick={confirmCancel} disabled={saving}>
                {saving ? "Cancelando..." : "Cancelar suscripción"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
