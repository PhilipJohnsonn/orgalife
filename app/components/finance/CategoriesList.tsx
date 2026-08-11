"use client";

import { useState } from "react";
import { Category } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316", "#6B7280", "#14B8A6"];

interface Props {
  categories: Category[];
  onUpdate: () => void;
}

interface EditState {
  id: string;
  name: string;
  color: string;
}

export function CategoriesList({ categories, onUpdate }: Props) {
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", color: COLORS[0] });
  const [editing, setEditing] = useState<EditState | null>(null);

  async function addCategory() {
    if (!addForm.name.trim()) return;
    await fetch("/api/finance/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addForm.name.trim(), color: addForm.color }),
    });
    setAddForm({ name: "", color: COLORS[0] });
    setAdding(false);
    onUpdate();
  }

  async function saveEdit() {
    if (!editing || !editing.name.trim()) return;
    await fetch(`/api/finance/categories/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name.trim(), color: editing.color }),
    });
    setEditing(null);
    onUpdate();
  }

  async function deleteCategory(id: string) {
    await fetch(`/api/finance/categories/${id}`, { method: "DELETE" });
    onUpdate();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Categorías</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3 mr-1" /> Agregar
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {categories.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-4">Sin categorías. Agregá una para organizar tus transacciones.</p>
        )}

        {categories.map((cat) => (
          <div key={cat.id} className="rounded-md">
            {editing?.id === cat.id ? (
              <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: editing.color }} />
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="h-7 text-sm flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }}
                  autoFocus
                />
                <div className="flex gap-1 shrink-0">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`w-5 h-5 rounded-full border-2 ${editing.color === c ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditing({ ...editing, color: c })}
                    />
                  ))}
                </div>
                <button onClick={saveEdit} className="text-green-500 hover:text-green-600 shrink-0">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 hover:bg-muted/40 rounded-md group">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                <span className="text-sm flex-1">{cat.name}</span>
                <button
                  onClick={() => setEditing({ id: cat.id, name: cat.name, color: cat.color })}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {adding && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30 mt-2">
            <Label className="text-xs">Nueva categoría</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nombre"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                className="h-8 text-sm flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") { setAdding(false); setAddForm({ name: "", color: COLORS[0] }); } }}
                autoFocus
              />
            </div>
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-6 h-6 rounded-full border-2 ${addForm.color === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setAddForm({ ...addForm, color: c })}
                />
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setAddForm({ name: "", color: COLORS[0] }); }}>
                Cancelar
              </Button>
              <Button size="sm" onClick={addCategory}>Guardar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
