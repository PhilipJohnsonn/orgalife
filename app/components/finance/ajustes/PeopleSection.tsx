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
import { requestJson } from "@/app/components/finance/cierre/shared";

type Person = { id: string; name: string; balances: { currency: string; balance: string }[] };

function describeBalance({ currency, balance }: Person["balances"][number]) {
  const amount = `${balance.replace("-", "")} ${currency}`;
  return balance.startsWith("-") ? `le debés ${amount}` : `te debe ${amount}`;
}

export function PeopleSection() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // null = closed; "new" = alta; a person = edición.
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");

  const [removing, setRemoving] = useState<Person | null>(null);
  const [removeError, setRemoveError] = useState("");

  const load = useCallback(async () => {
    setPeople(await requestJson("/api/finance/v1/people"));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .catch(() => setError("No se pudieron cargar las personas."))
      .finally(() => setLoading(false));
  }, [load]);

  function openForm(person: Person | "new") {
    setEditing(person);
    setName(person === "new" ? "" : person.name);
    setFormError("");
  }

  function closeForm() {
    setEditing(null);
    setName("");
    setFormError("");
  }

  async function savePerson() {
    if (!editing || saving || !name.trim()) return;
    setSaving(true);
    setFormError("");
    try {
      await requestJson(editing === "new" ? "/api/finance/v1/people" : `/api/finance/v1/people/${editing.id}`, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      closeForm();
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "No se pudo guardar la persona");
    } finally {
      setSaving(false);
    }
  }

  function closeRemove() {
    setRemoving(null);
    setRemoveError("");
  }

  async function confirmRemove() {
    if (!removing || saving) return;
    setSaving(true);
    setRemoveError("");
    try {
      await requestJson(`/api/finance/v1/people/${removing.id}`, { method: "DELETE" });
      closeRemove();
      await load();
    } catch (cause) {
      setRemoveError(cause instanceof Error ? cause.message : "No se pudo quitar la persona");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Personas</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">Con quienes compartís gastos. Sólo podés quitar a alguien con saldo 0.</p>

        {loading && <p className="text-sm text-muted-foreground">Cargando personas…</p>}
        {!loading && people.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no agregaste a nadie.</p>
        )}
        {people.map((person) => (
          <div key={person.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{person.name}</span>
              <span className="block text-xs text-muted-foreground">
                {person.balances.length === 0 ? "Sin saldo" : person.balances.map(describeBalance).join(" · ")}
              </span>
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`Acciones de ${person.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openForm(person)}>Editar</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(person)}>Quitar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {!loading && (
          <Button variant="outline" className="min-h-11" onClick={() => openForm("new")}>Agregar persona</Button>
        )}

        <Dialog open={editing !== null} onOpenChange={(open) => (open ? undefined : closeForm())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Nueva persona" : "Editar persona"}</DialogTitle>
              <DialogDescription>El nombre que vas a ver al dividir un gasto.</DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void savePerson();
              }}
            >
              {formError && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="personName">Nombre</Label>
                <Input
                  id="personName"
                  value={name}
                  maxLength={60}
                  autoComplete="off"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Juan"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" className="min-h-11" disabled={saving || !name.trim()}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={removing !== null} onOpenChange={(open) => (open ? undefined : closeRemove())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quitar a {removing?.name}</DialogTitle>
              <DialogDescription>
                Si ya compartieron gastos, se archiva y se conserva el historial. El saldo tiene que estar en 0.
              </DialogDescription>
            </DialogHeader>
            {removeError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{removeError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" onClick={closeRemove}>Cancelar</Button>
              <Button type="button" variant="destructive" className="min-h-11" disabled={saving} onClick={() => void confirmRemove()}>
                {saving ? "Quitando..." : "Quitar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
