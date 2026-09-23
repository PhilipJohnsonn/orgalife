"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentMonth, monthLabel, shiftMonth } from "./format";
import { useMonth } from "./useMonth";

export function MonthPicker() {
  const { month, setMonth } = useMonth();
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}>
        <ChevronLeft />
      </Button>
      <span className="text-base font-semibold">{monthLabel(month)}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Mes siguiente"
        disabled={isCurrent}
        onClick={() => setMonth(shiftMonth(month, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
