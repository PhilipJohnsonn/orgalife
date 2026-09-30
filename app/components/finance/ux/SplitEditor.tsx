"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { splitSharedExpense, type SplitInput, type SplitMode } from "@/app/lib/shared-expense";
import { formatMoney } from "./format";
import type { Person } from "./types";

export type SplitDraft = {
  personIds: string[];
  mode: SplitMode;
  me: string;
  values: Record<string, string>;
};

export const EMPTY_SPLIT: SplitDraft = { personIds: [], mode: "EQUAL", me: "", values: {} };

const MODES: { value: SplitMode; label: string }[] = [
  { value: "EQUAL", label: "Partes iguales" },
  { value: "AMOUNTS", label: "Montos" },
  { value: "PERCENTAGES", label: "Porcentajes" },
];

const NATIVE_SELECT =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function normalize(raw: string) {
  return raw.trim().replace(",", ".");
}

/** `requiredIds` (e.g. whoever paid) always take part, even if not picked. */
export function toSplitInput(draft: SplitDraft, requiredIds: string[] = []): SplitInput {
  const ids = [...new Set([...requiredIds, ...draft.personIds])];
  if (draft.mode === "EQUAL") return { mode: "EQUAL", people: ids.map((personId) => ({ personId })) };
  return {
    mode: draft.mode,
    me: normalize(draft.me),
    people: ids.map((personId) => ({ personId, value: normalize(draft.values[personId] ?? "") })),
  };
}

/** Your part with the same rules as the server, or why the split doesn't add up yet. */
export function previewSplit(total: string | null, split: SplitInput): { me: string } | { error: string } {
  if (!total) return { error: "Ingresá el monto para ver tu parte." };
  try {
    return { me: splitSharedExpense(total, split).me };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "La división no cierra." };
  }
}

export function SplitEditor({
  people,
  draft,
  onChange,
  total,
  currency,
  requiredIds = [],
  onNavigate,
}: {
  people: Person[];
  draft: SplitDraft;
  onChange: (draft: SplitDraft) => void;
  total: string | null;
  currency: string;
  requiredIds?: string[];
  onNavigate?: () => void;
}) {
  if (people.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Primero agregá personas en{" "}
        <Link href="/finanzas/ajustes" className="font-medium text-foreground underline" onClick={onNavigate}>
          Ajustes
        </Link>
        .
      </p>
    );
  }

  const split = toSplitInput(draft, requiredIds);
  const participants = people.filter((person) => split.people.some((item) => item.personId === person.id));
  const preview = previewSplit(total, split);
  const unit = draft.mode === "PERCENTAGES" ? "%" : currency;

  function toggle(personId: string) {
    const personIds = draft.personIds.includes(personId)
      ? draft.personIds.filter((id) => id !== personId)
      : [...draft.personIds, personId];
    onChange({ ...draft, personIds });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Con quién</span>
        <div className="flex flex-wrap gap-2">
          {people.map((person) => {
            const required = requiredIds.includes(person.id);
            const selected = required || draft.personIds.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                aria-pressed={selected}
                disabled={required}
                onClick={() => toggle(person.id)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {person.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="split-mode">División</Label>
        <select
          id="split-mode"
          className={NATIVE_SELECT}
          value={draft.mode}
          onChange={(event) => onChange({ ...draft, mode: event.target.value as SplitMode })}
        >
          {MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </div>

      {draft.mode !== "EQUAL" && participants.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="split-me">Vos ({unit})</Label>
            <Input
              id="split-me"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="h-11"
              value={draft.me}
              onChange={(event) => onChange({ ...draft, me: event.target.value })}
            />
          </div>
          {participants.map((person) => (
            <div key={person.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`split-${person.id}`}>
                {person.name} ({unit})
              </Label>
              <Input
                id={`split-${person.id}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="h-11"
                value={draft.values[person.id] ?? ""}
                onChange={(event) =>
                  onChange({ ...draft, values: { ...draft.values, [person.id]: event.target.value } })
                }
              />
            </div>
          ))}
        </div>
      )}

      <p className={cn("text-sm", "error" in preview ? "text-muted-foreground" : "font-medium")}>
        {"error" in preview ? preview.error : `Tu parte: ${formatMoney(preview.me, currency)}`}
      </p>
    </div>
  );
}
