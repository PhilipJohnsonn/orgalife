"use client";

import { useState } from "react";
import { Debt } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Check } from "lucide-react";

interface Props {
  debts: Debt[];
  onUpdate: () => void;
  exchangeRate: number;
}

const emptyForm = { description: "", creditor: "", amountUSD: "", amountARS: "" };

function toUSD(debt: Debt, tc: number): number {
  let total = debt.amountUSD ?? 0;
  if (debt.amountARS) total += debt.amountARS / tc;
  return total;
}

export function DebtsList({ debts, onUpdate, exchangeRate }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [adding, setAdding] = useState(false);

  const activeDebts = debts.filter((d) => !d.isPaid);
  const totalIncluded = activeDebts
    .filter((d) => d.isIncluded)
    .reduce((sum, d) => sum + toUSD(d, exchangeRate), 0);

  async function addDebt() {
    if (!form.description) return;
    await fetch("/api/finance/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: form.description,
        creditor: form.creditor || null,
        amountUSD: form.amountUSD ? parseFloat(form.amountUSD) : null,
        amountARS: form.amountARS ? parseFloat(form.amountARS) : null,
      }),
    });
    setForm(emptyForm);
    setAdding(false);
    onUpdate();
  }

  async function toggleIncluded(debt: Debt) {
    await fetch(`/api/finance/debts/${debt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isIncluded: !debt.isIncluded }),
    });
    onUpdate();
  }

  async function markPaid(debt: Debt) {
    await fetch(`/api/finance/debts/${debt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaid: true }),
    });
    onUpdate();
  }

  async function deleteDebt(id: string) {
    await fetch(`/api/finance/debts/${id}`, { method: "DELETE" });
    onUpdate();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Deudas</CardTitle>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            Incluidas en balance:{" "}
            <span className="font-semibold text-foreground">
              U${totalIncluded.toFixed(2)}
            </span>
          </span>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3 mr-1" /> Agregar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Descripción *</Label>
                <Input
                  placeholder="DEUDA CLOT"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Acreedor</Label>
                <Input
                  placeholder="Nombre"
                  value={form.creditor}
                  onChange={(e) => setForm({ ...form, creditor: e.target.value })}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Monto USD</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.amountUSD}
                  onChange={(e) => setForm({ ...form, amountUSD: e.target.value })}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Monto ARS</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.amountARS}
                  onChange={(e) => setForm({ ...form, amountARS: e.target.value })}
                  className="h-8 text-sm mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setForm(emptyForm); }}>
                Cancelar
              </Button>
              <Button size="sm" onClick={addDebt}>Guardar</Button>
            </div>
          </div>
        )}

        {activeDebts.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-4">Sin deudas activas</p>
        )}

        {activeDebts.map((debt) => (
          <div
            key={debt.id}
            className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40 transition-colors"
          >
            <Switch
              checked={debt.isIncluded}
              onCheckedChange={() => toggleIncluded(debt)}
              title="Incluir en balance"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{debt.description}</p>
              {debt.creditor && (
                <p className="text-xs text-muted-foreground">{debt.creditor}</p>
              )}
            </div>
            <div className="text-right text-sm shrink-0">
              {debt.amountUSD != null && (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  U${debt.amountUSD.toFixed(2)}
                </span>
              )}
              {debt.amountARS != null && (
                <span className="text-muted-foreground ml-2">
                  ${debt.amountARS.toLocaleString("es-AR")}
                </span>
              )}
            </div>
            {!debt.isIncluded && (
              <Badge variant="outline" className="text-xs shrink-0">excluida</Badge>
            )}
            <button
              onClick={() => markPaid(debt)}
              className="text-muted-foreground hover:text-green-500 transition-colors"
              title="Marcar como pagada"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => deleteDebt(debt.id)}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {debts.filter((d) => d.isPaid).length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              {debts.filter((d) => d.isPaid).length} deuda(s) pagada(s)
            </summary>
            <div className="mt-2 space-y-1">
              {debts.filter((d) => d.isPaid).map((debt) => (
                <div key={debt.id} className="flex items-center gap-2 p-2 opacity-50">
                  <span className="text-sm line-through flex-1">{debt.description}</span>
                  <button onClick={() => deleteDebt(debt.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
