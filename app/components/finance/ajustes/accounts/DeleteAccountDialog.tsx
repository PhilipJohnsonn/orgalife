"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LedgerAccount, requestJson } from "@/app/components/finance/cierre/shared";

export function DeleteAccountDialog({
  account,
  onClose,
  onSaved,
  onDeleted,
}: {
  account: LedgerAccount;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: (result: "DELETED" | "ARCHIVED") => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const body = await requestJson(`/api/finance/v1/accounts/${account.id}`, { method: "DELETE" });
      onClose();
      onDeleted(body.result);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la cuenta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar {account.name}</DialogTitle>
          <DialogDescription>
            Si la cuenta nunca se usó se elimina. Si tiene movimientos se archiva: deja de aparecer, pero su historial se
            conserva.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" className="min-h-11" onClick={() => void confirm()} disabled={saving}>
            {saving ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
