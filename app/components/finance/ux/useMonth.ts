"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { currentMonth } from "./format";

/** Selected month lives in ?month=YYYY-MM so Mes and Movimientos share it. */
export function useMonth() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const param = searchParams.get("month");
  const month = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : currentMonth();

  const setMonth = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === currentMonth()) params.delete("month");
      else params.set("month", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { month, setMonth };
}
