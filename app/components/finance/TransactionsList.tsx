"use client";

import { useState } from "react";
import { Transaction, FinancialAccount, Category } from "./types";
import { BalanceSummary } from "./BalanceSummary";
import { FinanceCharts } from "./FinanceCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Repeat, CreditCard } from "lucide-react";

const CURRENCIES = ["ARS", "USD", "EUR", "UYU"];
const CARD_NAMES = ["VISA", "MASTER", "AMEX"];

type PresetKey = "this-month" | "last-month" | "this-year" | "all";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "this-month", label: "Este mes" },
  { key: "last-month", label: "Mes pasado" },
  { key: "this-year", label: "Este año" },
  { key: "all", label: "Todo" },
];

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(preset: PresetKey): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case "this-month":
      return {
        from: toYMD(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "last-month":
      return {
        from: toYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toYMD(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "this-year":
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
    case "all":
      return { from: "", to: "" };
  }
}

const METHOD_LABELS: Record<Transaction["method"], string> = {
  CASH: "Efectivo",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  TRANSFER: "Transferencia",
};

interface Props {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  categories: Category[];
  exchangeRate: number;
  onUpdate: () => void;
}

interface FormState {
  type: Transaction["type"];
  description: string;
  amount: string;
  currency: string;
  date: string;
  method: Transaction["method"];
  cardName: string;
  accountId: string;
  categoryId: string;
  isRecurring: boolean;
}

function emptyForm(): FormState {
  return {
    type: "EXPENSE",
    description: "",
    amount: "",
    currency: "ARS",
    date: new Date().toISOString().slice(0, 10),
    method: "CASH",
    cardName: CARD_NAMES[0],
    accountId: "none",
    categoryId: "none",
    isRecurring: false,
  };
}

export function TransactionsList({ transactions, accounts, categories, exchangeRate, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [preset, setPreset] = useState<PresetKey | null>("this-month");
  const [range, setRange] = useState(() => presetRange("this-month"));

  function applyPreset(key: PresetKey) {
    setPreset(key);
    setRange(presetRange(key));
  }

  function setRangeField(field: "from" | "to", value: string) {
    setPreset(null);
    setRange((r) => ({ ...r, [field]: value }));
  }

  const filtered = transactions.filter((t) => {
    const d = t.date.slice(0, 10);
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(t: Transaction) {
    setEditingId(t.id);
    setForm({
      type: t.type,
      description: t.description,
      amount: String(t.amount),
      currency: t.currency,
      date: t.date.slice(0, 10),
      method: t.method,
      cardName: t.cardName ?? CARD_NAMES[0],
      accountId: t.accountId ?? "none",
      categoryId: t.categoryId ?? "none",
      isRecurring: t.isRecurring,
    });
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    const amount = parseFloat(form.amount);
    if (!form.description.trim() || isNaN(amount) || amount <= 0) return;

    const amountUSD =
      form.currency === "USD" ? amount :
      form.currency === "ARS" && exchangeRate > 0 ? amount / exchangeRate :
      null;

    const body = {
      type: form.type,
      description: form.description.trim(),
      amount,
      currency: form.currency,
      amountUSD,
      date: form.date,
      method: form.method,
      cardName: form.method === "CREDIT" ? form.cardName : null,
      accountId: form.accountId === "none" ? null : form.accountId,
      categoryId: form.categoryId === "none" ? null : form.categoryId,
      isRecurring: form.isRecurring,
    };

    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/finance/transactions/${editingId}` : "/api/finance/transactions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      setOpen(false);
      onUpdate();
    } catch {
      alert("No se pudo guardar la transacción. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransaction(id: string) {
    await fetch(`/api/finance/transactions/${id}`, { method: "DELETE" });
    onUpdate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className={`px-2.5 py-0.5 rounded-full text-xs border transition-colors ${preset === p.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <Input
            type="date"
            value={range.from}
            onChange={(e) => setRangeField("from", e.target.value)}
            className="h-8 w-36 text-sm"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={range.to}
            onChange={(e) => setRangeField("to", e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </div>
      </div>

      <BalanceSummary transactions={filtered} exchangeRate={exchangeRate} />

      <FinanceCharts transactions={filtered} exchangeRate={exchangeRate} />

    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Transacciones</CardTitle>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-3 w-3 mr-1" /> Agregar
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Sin transacciones en este rango.</p>
        )}

        {filtered.map((t) => (
          <div key={t.id} className="flex items-center gap-2 p-2 hover:bg-muted/40 rounded-md group">
            <span className="text-xs text-muted-foreground w-20 shrink-0">
              {new Date(t.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" })}
            </span>
            <span className="text-sm flex-1 truncate">
              {t.description}
              {t.isRecurring && <Repeat className="inline h-3 w-3 ml-1.5 text-muted-foreground" />}
            </span>
            {t.cardExpenseId && (
              <span className="flex items-center gap-1 text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5 shrink-0">
                <CreditCard className="h-3 w-3" />
                {t.cardName}
              </span>
            )}
            {t.category && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.category.color }} />
                {t.category.name}
              </span>
            )}
            {t.account && (
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{t.account.name}</span>
            )}
            {!t.cardExpenseId && (
              <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                {METHOD_LABELS[t.method]}{t.method === "CREDIT" && t.cardName ? ` ${t.cardName}` : ""}
              </span>
            )}
            <span className={`text-sm font-medium tabular-nums shrink-0 w-32 text-right ${t.type === "INCOME" ? "text-green-600 dark:text-green-500" : ""}`}>
              {t.type === "INCOME" ? "+" : "−"}{t.amount.toLocaleString("es-AR", { maximumFractionDigits: 2 })} {t.currency}
            </span>
            <div className="flex items-center gap-2 w-9 shrink-0 justify-end">
              {t.cardExpenseId ? (
                <CreditCard
                  className="h-3.5 w-3.5 text-muted-foreground/50"
                  aria-label="Importada del resumen de tarjeta — se gestiona desde la tab Tarjetas"
                />
              ) : (
                <>
                  <button
                    onClick={() => openEdit(t)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTransaction(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar transacción" : "Nueva transacción"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-md">
              {(["EXPENSE", "INCOME"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, type })}
                  className={`py-1 rounded text-sm transition-colors ${form.type === type ? "bg-background shadow font-medium" : "text-muted-foreground"}`}
                >
                  {type === "EXPENSE" ? "Gasto" : "Ingreso"}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Supermercado, sueldo..."
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Monto</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Moneda</Label>
                <div className="flex gap-1">
                  {CURRENCIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, currency: c })}
                      className={`px-2 py-1 rounded-full text-xs border transition-colors ${form.currency === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fecha</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Método</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as FormState["method"] })}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHOD_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.method === "CREDIT" && (
              <div className="space-y-1">
                <Label className="text-xs">Tarjeta</Label>
                <div className="flex gap-1">
                  {CARD_NAMES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, cardName: c })}
                      className={`px-2 py-1 rounded-full text-xs border transition-colors ${form.cardName === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Al importar el resumen de esta tarjeta, las cargadas a mano se reemplazan por las del PDF.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cuenta</Label>
                <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin cuenta</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoría</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                className="accent-primary"
              />
              Recurrente (se repite todos los meses)
            </label>

            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
    </div>
  );
}
