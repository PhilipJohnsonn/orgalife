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

type WalletAlias = {
  id: string;
  label: string;
  aliasNormalized: string;
  ledgerAccountId: string;
  ledgerAccount: { id: string; name: string; currency: string };
};

type QuickCaptureAccount = { id: string; name: string; currency: string; kind: string };

function emptyForm() {
  return { label: "", ledgerAccountId: "" };
}

export function WalletAliasesSection() {
  const [aliases, setAliases] = useState<WalletAlias[]>([]);
  const [accounts, setAccounts] = useState<QuickCaptureAccount[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState(emptyForm);

  const [editing, setEditing] = useState<WalletAlias | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState("");

  const [deleting, setDeleting] = useState<WalletAlias | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    const [aliasesBody, optionsBody] = await Promise.all([
      requestJson("/api/finance/v1/wallet-aliases"),
      requestJson("/api/finance/v1/quick-capture/options"),
    ]);
    setAliases(aliasesBody);
    setAccounts(optionsBody.accounts);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .catch(() => setError("No se pudieron cargar las tarjetas de Wallet."))
      .finally(() => setLoading(false));
  }, [load]);

  function closeForm() {
    setForm(emptyForm());
    setFormError("");
    setShowForm(false);
  }

  async function createAlias() {
    if (saving || !form.label.trim() || !form.ledgerAccountId) return;
    setSaving(true);
    setFormError("");
    try {
      await requestJson("/api/finance/v1/wallet-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label.trim(), ledgerAccountId: form.ledgerAccountId }),
      });
      closeForm();
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "No se pudo guardar la tarjeta");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(alias: WalletAlias) {
    setEditing(alias);
    setEditForm({ label: alias.label, ledgerAccountId: alias.ledgerAccountId });
    setEditError("");
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(emptyForm());
    setEditError("");
  }

  async function saveEdit() {
    if (!editing || saving || !editForm.label.trim() || !editForm.ledgerAccountId) return;
    setSaving(true);
    setEditError("");
    try {
      await requestJson(`/api/finance/v1/wallet-aliases/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editForm.label.trim(), ledgerAccountId: editForm.ledgerAccountId }),
      });
      closeEdit();
      await load();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "No se pudo guardar la tarjeta");
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
      await requestJson(`/api/finance/v1/wallet-aliases/${deleting.id}`, { method: "DELETE" });
      closeDeleteDialog();
      await load();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "No se pudo eliminar la tarjeta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tarjetas de Apple Pay (Wallet)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Escribí el nombre exacto de la tarjeta como aparece en Wallet (ej. &quot;Revolut&quot;, &quot;ICBC Visa&quot;).
        </p>

        {!loading && aliases.length === 0 && <p className="text-sm text-muted-foreground">Todavía no asociaste ninguna tarjeta.</p>}
        {aliases.map((alias) => (
          <div key={alias.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span>{alias.label} → {alias.ledgerAccount.name} ({alias.ledgerAccount.currency})</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11" aria-label={`Acciones de ${alias.label}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openEdit(alias)}>Editar</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(alias)}>Eliminar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}

        {!loading && (
          <Button variant="outline" className="min-h-11" onClick={() => setShowForm(true)}>Agregar tarjeta</Button>
        )}

        <Dialog open={showForm} onOpenChange={(open) => (open ? setShowForm(true) : closeForm())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva tarjeta de Wallet</DialogTitle>
              <DialogDescription>
                Escribí el nombre exacto de la tarjeta como aparece en Wallet (ej. &quot;Revolut&quot;, &quot;ICBC Visa&quot;).
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void createAlias();
              }}
            >
              {formError && (
                <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {formError}
                </p>
              )}
              <div>
                <Label htmlFor="walletAliasLabel">Nombre en Wallet</Label>
                <Input id="walletAliasLabel" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="ICBC Visa" />
              </div>
              <div>
                <Label htmlFor="walletAliasAccount">Cuenta</Label>
                <select id="walletAliasAccount" className={selectClass()} value={form.ledgerAccountId} onChange={(event) => setForm({ ...form, ledgerAccountId: event.target.value })}>
                  <option value="">Elegí una cuenta</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
                </select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" className="min-h-11" disabled={saving || !form.label.trim() || !form.ledgerAccountId}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : closeEdit())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar tarjeta</DialogTitle>
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
                <Label htmlFor="editWalletAliasLabel">Nombre en Wallet</Label>
                <Input id="editWalletAliasLabel" value={editForm.label} onChange={(event) => setEditForm({ ...editForm, label: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="editWalletAliasAccount">Cuenta</Label>
                <select id="editWalletAliasAccount" className={selectClass()} value={editForm.ledgerAccountId} onChange={(event) => setEditForm({ ...editForm, ledgerAccountId: event.target.value })}>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
                </select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={closeEdit}>Cancelar</Button>
                <Button type="submit" className="min-h-11" disabled={saving || !editForm.label.trim() || !editForm.ledgerAccountId}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={deleting !== null} onOpenChange={(open) => (open ? null : closeDeleteDialog())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar tarjeta</DialogTitle>
              <DialogDescription>
                {deleting ? `Se va a eliminar "${deleting.label}". No podés deshacer esto.` : ""}
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
