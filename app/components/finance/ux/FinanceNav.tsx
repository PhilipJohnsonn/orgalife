"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, ListChecks, ReceiptText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/finanzas/mes", label: "Mes", icon: CalendarRange, keepsMonth: true },
  { href: "/finanzas/movimientos", label: "Movimientos", icon: ListChecks, keepsMonth: true },
  { href: "/finanzas/cierre", label: "Cierre", icon: ReceiptText, keepsMonth: false },
  { href: "/finanzas/ajustes", label: "Ajustes", icon: Settings, keepsMonth: false },
];

export function FinanceNav({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("month");

  const items = tabs.map((tab) => ({
    ...tab,
    to: tab.keepsMonth && month ? `${tab.href}?month=${month}` : tab.href,
    active: pathname.startsWith(tab.href),
  }));

  if (variant === "top") {
    return (
      <nav className="hidden border-b md:flex" aria-label="Finanzas">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.to}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              item.active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Finanzas"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.to}
          className={cn(
            "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
            item.active ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <item.icon className="size-5" aria-hidden />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
