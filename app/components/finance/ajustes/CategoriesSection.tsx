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
import { requestJson, selectClass } from "@/app/components/finance/cierre/shared";
import { PurchaseLine } from "./purchaseLines";

type Category = { id: string; name: string; color: string; createdAt: string };

type CategoryData = {
  categories: Category[];
  rules: {
    id: string;
    patternNormalized: string;
    isActive: boolean;
    category: { id: string; name: string };
  }[];
};

const DEFAULT_COLOR = "#6B7280";

function emptyForm() {
  return { name: "", color: DEFAULT_COLOR };
}

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
  const [lineCategories, setLineCategories] = useState<Record<string, string>>({});
  const [learnRules, setLearnRules] = useState<Record<string, boolean>>({});

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const [editing, setEditing] = useState<Category | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState("");

  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setCategoryData(await requestJson("/api/finance/v1/categories"));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setError("No se pudieron cargar las categorías."));
  }, [load]);

  function closeForm() {
    setForm(emptyForm());
    setFormError("");
    setShowForm(false);
  }

  async function createCategory() {
    if (saving || !form.name.trim()) return;
    setSaving(true);
    setFormError("");
    try {
      await requestJson("/api/finance/v1/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), color: form.color }),
      });
      closeForm();
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "No se pudo crear la categoría");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(category: Category) {
    setEditing(category);
    setEditForm({ name: category.name, color: category.color });
    setEditError("");
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(emptyForm());
    setEditError("");
  }

  async function saveEdit() {
    if (!editing || saving || !editForm.name.trim()) return;
    setSaving(true);
    setEditError("");
    try {
      await requestJson(`/api/finance/v1/categories/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name.trim(), color: editForm.color }),
      });
      closeEdit();
      await load();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "No se pudo guardar la categoría");
    } finally {
      setSaving(false);
    }
  }

  function closeDeleteDialog() {
    setDeleting(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleting || saving) return;
    setSaving(true);
    setDeleteError("");
    try {
      await requestJson(`/api/finance/v1/categories/${deleting.id}`, { method: "DELETE" });
      closeDeleteDialog();
      await load();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "No se pudo eliminar la categoría");
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
      <CardContent className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Tus categorías</h3>
          {categoryData.categories.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no creaste ninguna categoría.</p>
          )}
          {categoryData.categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="inline-block size-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                {category.name}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-11" aria-label={`Acciones de ${category.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openEdit(category)}>Editar</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(category)}>Eliminar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
          <Button variant="outline" className="min-h-11" onClick={() => setShowForm(true)}>Agregar categoría</Button>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <h3 className="text-sm font-medium">Reglas aprendidas</h3>
            <p className="text-xs text-muted-foreground">Cuando un comercio coincide, la categoría se asigna sola.</p>
          </div>
          {purchaseLines.map((line) => (
            <div key={line.id} className="grid gap-2 rounded-md border p-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto_auto] sm:items-center">
              <span>{line.description} · {line.billedAmount} {line.billedCurrency}</span>
              <select
                aria-label={`Categoría de ${line.description}`}
                className={selectClass()}
                value={lineCategories[line.id] ?? line.category?.id ?? ""}
                onChange={(event) => setLineCategories({ ...lineCategories, [line.id]: event.target.value })}
              >
                <option value="">Sin categoría</option>
                {categoryData.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={learnRules[line.id] ?? false} onChange={(event) => setLearnRules({ ...learnRules, [line.id]: event.target.checked })} /> Recordar
              </label>
              <Button size="sm" variant="outline" onClick={() => categorizeLine(line)} disabled={saving || !(lineCategories[line.id] ?? line.category?.id)}>Guardar</Button>
            </div>
          ))}
          {categoryData.rules.filter((rule) => rule.isActive).map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 p-2 text-sm">
              <span>{rule.patternNormalized} → {rule.category.name}</span>
              <Button size="sm" variant="ghost" onClick={() => deactivateRule(rule.id)} disabled={saving}>Desactivar</Button>
            </div>
          ))}
        </div>

        <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : closeForm())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva categoría</DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void createCategory();
              }}
            >
              {formError && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </p>
              )}
              <div>
                <Label htmlFor="categoryName">Nombre</Label>
                <Input id="categoryName" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Supermercado" />
              </div>
              <div>
                <Label htmlFor="categoryColor">Color</Label>
                <input
                  id="categoryColor"
                  type="color"
                  className="h-9 w-16 rounded-md border bg-background p-1"
                  value={form.color}
                  onChange={(event) => setForm({ ...form, color: event.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" className="min-h-11" disabled={saving || !form.name.trim()}>{saving ? "Guardando..." : "Guardar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : closeEdit())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar categoría</DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
            >
              {editError && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {editError}
                </p>
              )}
              <div>
                <Label htmlFor="editCategoryName">Nombre</Label>
                <Input id="editCategoryName" value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="editCategoryColor">Color</Label>
                <input
                  id="editCategoryColor"
                  type="color"
                  className="h-9 w-16 rounded-md border bg-background p-1"
                  value={editForm.color}
                  onChange={(event) => setEditForm({ ...editForm, color: event.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={closeEdit}>Cancelar</Button>
                <Button type="submit" className="min-h-11" disabled={saving || !editForm.name.trim()}>{saving ? "Guardando..." : "Guardar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={deleting !== null} onOpenChange={(open) => (open ? null : closeDeleteDialog())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar categoría</DialogTitle>
              <DialogDescription>
                {deleting ? `Se va a eliminar "${deleting.name}". No podés deshacer esto.` : ""}
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {deleteError}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" className="min-h-11" onClick={closeDeleteDialog}>Cancelar</Button>
              <Button variant="destructive" className="min-h-11" onClick={confirmDelete} disabled={saving}>
                {saving ? "Eliminando..." : "Eliminar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
