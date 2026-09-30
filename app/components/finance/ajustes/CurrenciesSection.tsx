"use client";

import { useState } from "react";
import { X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestJson } from "@/app/components/finance/cierre/shared";
import { searchCurrencies } from "@/app/lib/finance-currencies";

export function CurrenciesSection({
  currencies,
  loading,
  onChanged,
}: {
  currencies: string[];
  loading: boolean;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState("");
  const results = searchCurrencies(query, currencies);

  function closeForm() {
    setQuery("");
    setFormError("");
    setShowForm(false);
  }

  async function addCurrency(code: string) {
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      await requestJson("/api/finance/v1/currencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      closeForm();
      await onChanged();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "No se pudo agregar la moneda");
    } finally {
      setSaving(false);
    }
  }

  async function removeCurrency(currency: string) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/finance/v1/currencies/${currency}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "No se pudo quitar la moneda");
      }
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo quitar la moneda");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Monedas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Las que aparecen en el + y al crear una cuenta. No podés quitar una que use una cuenta activa.
        </p>

        {loading && <p className="text-sm text-muted-foreground">Cargando monedas…</p>}
        <div className="flex flex-wrap gap-2">
          {currencies.map((currency) => (
            <span key={currency} className="inline-flex items-center gap-1 rounded-md border py-1 pl-3 pr-1 text-sm">
              {currency}
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label={`Quitar ${currency}`}
                disabled={saving}
                onClick={() => void removeCurrency(currency)}
              >
                <X />
              </Button>
            </span>
          ))}
        </div>

        {!loading && (
          <Button variant="outline" className="min-h-11" onClick={() => setShowForm(true)}>Agregar moneda</Button>
        )}

        <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : closeForm())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva moneda</DialogTitle>
              <DialogDescription>Buscá por código o nombre (ej. EUR, libra, dólar neozelandés).</DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (results[0]) void addCurrency(results[0].code);
              }}
            >
              {formError && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currencySearch">Moneda</Label>
                <Input
                  id="currencySearch"
                  type="search"
                  enterKeyHint="done"
                  value={query}
                  autoComplete="off"
                  autoCorrect="off"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar moneda"
                />
              </div>
              {query.trim() && (
                <ul className="divide-y rounded-md border" aria-label="Resultados">
                  {results.map((option) => (
                    <li key={option.code}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm disabled:opacity-50"
                        disabled={saving}
                        onClick={() => void addCurrency(option.code)}
                      >
                        <span className="font-medium">{option.code}</span>
                        <span className="inline-block text-muted-foreground first-letter:uppercase">{option.name}</span>
                      </button>
                    </li>
                  ))}
                  {results.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
                  )}
                </ul>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={closeForm}>Cancelar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
