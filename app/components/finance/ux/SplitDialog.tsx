"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "./format";
import { EMPTY_SPLIT, SplitEditor, toSplitInput, type SplitDraft } from "./SplitEditor";
import type { ApiError, MonthMovement, Person } from "./types";

/** "Dividir": turns an expense already captured into a shared one (POST /entries/:id/split). */
export function SplitDialog({
  movement,
  onClose,
  onSplit,
}: {
  movement: MonthMovement | null;
  onClose: () => void;
  onSplit: () => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SplitDraft>(EMPTY_SPLIT);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset the form during render when a different movement opens, instead of an effect.
  const [trackedMovementId, setTrackedMovementId] = useState<string | null>(movement?.id ?? null);
  if ((movement?.id ?? null) !== trackedMovementId) {
    setTrackedMovementId(movement?.id ?? null);
    setDraft(EMPTY_SPLIT);
    setFormError(null);
  }

  useEffect(() => {
    if (!movement) return;
    let ignore = false;
    fetch("/api/finance/v1/people", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar las personas");
        const list = (await res.json()) as Person[];
        if (!ignore) {
          setPeople(list);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!ignore) setLoadError(err instanceof Error ? err.message : "No se pudieron cargar las personas");
      });
    return () => {
      ignore = true;
    };
  }, [movement]);

  async function handleSubmit() {
    if (!movement || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/finance/v1/entries/${movement.id}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ split: toSplitInput(draft) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        setFormError(body?.error?.message ?? "No se pudo dividir el gasto.");
        return;
      }
      onSplit();
    } catch {
      setFormError("No se pudo conectar. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={movement !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dividir gasto</DialogTitle>
          {movement && (
            <DialogDescription className="truncate">
              {movement.description} · {formatMoney(movement.amount, movement.currency)}
            </DialogDescription>
          )}
        </DialogHeader>
        {movement && (
          <div className="flex flex-col gap-4">
            {people === null && !loadError && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
            {people !== null && (
              <SplitEditor
                people={people}
                draft={draft}
                onChange={setDraft}
                total={movement.amount}
                currency={movement.currency}
                onNavigate={onClose}
              />
            )}
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button
              type="button"
              size="lg"
              className="h-12 w-full text-base"
              disabled={submitting || !people?.length}
              onClick={handleSubmit}
            >
              {submitting ? "Guardando…" : "Dividir"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
