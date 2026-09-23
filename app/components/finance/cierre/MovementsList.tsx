"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LedgerMovement } from "./shared";

function movementSummary(movement: LedgerMovement) {
  if (movement.type === "INCOME" && movement.destination) {
    return `+${movement.destination.amount} ${movement.destination.currency} · ${movement.destination.name}`;
  }
  if (movement.type === "EXPENSE" && movement.source) {
    return `−${movement.source.amount} ${movement.source.currency} · ${movement.source.name}`;
  }
  if (movement.source && movement.destination) {
    return movement.type === "FX"
      ? `${movement.source.amount} ${movement.source.currency} → ${movement.destination.amount} ${movement.destination.currency}`
      : `${movement.source.amount} ${movement.source.currency} · ${movement.source.name} → ${movement.destination.name}`;
  }
  return "Movimiento sin detalle";
}

export function MovementsList({ movements }: { movements: LedgerMovement[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Movimientos confirmados</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {movements.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay movimientos en esta vista.</p>}
        {movements.map((movement) => (
          <div key={movement.id} className="grid gap-1 rounded-md border p-3 text-sm sm:grid-cols-[6rem_1fr_auto] sm:items-center sm:gap-3">
            <span className="text-muted-foreground">{movement.occurredOn}</span>
            <span><span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs">{movement.type}</span>{movement.description}</span>
            <span className="tabular-nums">{movementSummary(movement)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
