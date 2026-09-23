"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requestJson, selectClass } from "@/app/components/finance/cierre/shared";
import { PurchaseLine } from "./purchaseLines";

type CategoryData = {
  categories: { id: string; name: string; color: string }[];
  rules: {
    id: string;
    patternNormalized: string;
    isActive: boolean;
    category: { id: string; name: string };
  }[];
};

export function CategoriesSection({
  purchaseLines,
  onCategorized,
}: {
  purchaseLines: PurchaseLine[];
  onCategorized: () => Promise<void>;
}) {
  const [categoryData, setCategoryData] = useState<CategoryData>({ categories: [], rules: [] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [lineCategories, setLineCategories] = useState<Record<string, string>>({});
  const [learnRules, setLearnRules] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setCategoryData(await requestJson("/api/finance/v1/categories"));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar las categorías."));
  }, [load]);

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

  async function categorizeLine(line: PurchaseLine) {
    const categoryId = lineCategories[line.id] ?? line.category?.id;
    if (!categoryId) return;
    setSaving(true);
    try {
      await requestJson(`/api/finance/v1/card-statements/lines/${line.id}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, learnRule: learnRules[line.id] ?? false }),
      });
      await Promise.all([load(), onCategorized()]);
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
    <Card>
      <CardHeader><CardTitle className="text-base">Categorías y reglas aprendidas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><Input aria-label="Nueva categoría" placeholder="Nueva categoría" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /><Button onClick={createCategory} disabled={saving || !categoryName.trim()}>Crear</Button></div>
        {purchaseLines.map((line) => <div key={line.id} className="grid gap-2 rounded-md border p-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto_auto] sm:items-center"><span>{line.description} · {line.billedAmount} {line.billedCurrency}</span><select aria-label={`Categoría de ${line.description}`} className={selectClass()} value={lineCategories[line.id] ?? line.category?.id ?? ""} onChange={(event) => setLineCategories({ ...lineCategories, [line.id]: event.target.value })}><option value="">Sin categoría</option>{categoryData.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><label className="flex items-center gap-1"><input type="checkbox" checked={learnRules[line.id] ?? false} onChange={(event) => setLearnRules({ ...learnRules, [line.id]: event.target.checked })} /> Recordar</label><Button size="sm" variant="outline" onClick={() => categorizeLine(line)} disabled={saving || !(lineCategories[line.id] ?? line.category?.id)}>Guardar</Button></div>)}
        {categoryData.rules.filter((rule) => rule.isActive).map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 p-2 text-sm"><span>{rule.patternNormalized} → {rule.category.name}</span><Button size="sm" variant="ghost" onClick={() => deactivateRule(rule.id)} disabled={saving}>Desactivar</Button></div>)}
      </CardContent>
    </Card>
  );
}
