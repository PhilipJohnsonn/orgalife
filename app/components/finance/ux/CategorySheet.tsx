"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { ApiError, CaptureOptions, MonthMovement } from "./types";

type PickedCategory = { id: string; name: string; color?: string };

/** Quick-capture descriptions are "Merchant — note (12.50 AUD)"; mirrors app/lib/finance-month.ts. */
function merchantFromDescription(description: string) {
  return description.split(/ — | \(/)[0].trim();
}

export function CategorySheet({
  movement,
  onClose,
  onSelect,
}: {
  movement: MonthMovement | null;
  onClose: () => void;
  onSelect: (category: PickedCategory, learnRule: boolean) => void;
}) {
  const [categories, setCategories] = useState<CaptureOptions["categories"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [learnRule, setLearnRule] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const requestedCategories = useRef(false);

  // Reset the form during render when a different movement opens, instead of an effect.
  const [trackedMovementId, setTrackedMovementId] = useState<string | null>(movement?.id ?? null);
  if ((movement?.id ?? null) !== trackedMovementId) {
    setTrackedMovementId(movement?.id ?? null);
    setSearch("");
    setLearnRule(true);
    setNewName("");
    setCreateError(null);
  }

  useEffect(() => {
    if (!movement || requestedCategories.current) return;
    requestedCategories.current = true;
    let ignore = false;
    fetch("/api/finance/v1/quick-capture/options", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar las categorías");
        const data = (await res.json()) as CaptureOptions;
        if (!ignore) setCategories(data.categories);
      })
      .catch((err) => {
        if (ignore) return;
        requestedCategories.current = false;
        setLoadError(err instanceof Error ? err.message : "No se pudieron cargar las categorías");
      });
    return () => {
      ignore = true;
    };
  }, [movement]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/finance/v1/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(body?.error?.message ?? "No se pudo crear la categoría");
      }
      const created = (await res.json()) as { id: string; name: string; color: string };
      setCategories((current) => (current ? [...current, { id: created.id, name: created.name }] : current));
      setNewName("");
      onSelect({ id: created.id, name: created.name, color: created.color }, learnRule);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo crear la categoría");
    } finally {
      setCreating(false);
    }
  }

  const filteredCategories =
    categories?.filter((category) => category.name.toLowerCase().includes(search.trim().toLowerCase())) ?? [];

  return (
    <Sheet open={movement !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="flex max-h-[85vh] flex-col">
        <SheetHeader>
          <SheetTitle>Elegí una categoría</SheetTitle>
          {movement && <SheetDescription className="truncate">{movement.description}</SheetDescription>}
        </SheetHeader>
        {movement && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4">
            <Input
              placeholder="Buscar categoría"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Buscar categoría"
            />
            <label
              htmlFor="movement-learn-rule"
              className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border px-3"
            >
              <span className="text-sm">Recordar para {merchantFromDescription(movement.description)}</span>
              <Switch id="movement-learn-rule" checked={learnRule} onCheckedChange={setLearnRule} />
            </label>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {categories === null && !loadError && (
                <p className="px-1 py-2 text-sm text-muted-foreground">Cargando categorías…</p>
              )}
              {loadError && <p className="px-1 py-2 text-sm text-destructive">{loadError}</p>}
              {categories !== null && !loadError && filteredCategories.length === 0 && (
                <p className="px-1 py-2 text-sm text-muted-foreground">No se encontraron categorías.</p>
              )}
              <div className="flex flex-col">
                {filteredCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => onSelect({ id: category.id, name: category.name }, learnRule)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="truncate">{category.name}</span>
                    {movement.category?.id === category.id && (
                      <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-border pt-3">
              <Input
                placeholder="Nueva categoría"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                aria-label="Nueva categoría"
              />
              <Button type="button" size="sm" disabled={!newName.trim() || creating} onClick={handleCreate}>
                {creating ? "Creando…" : "Crear"}
              </Button>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
