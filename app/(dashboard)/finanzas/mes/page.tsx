import { Suspense } from "react";
import { MonthView } from "@/app/components/finance/ux/MonthView";

export default function Page() {
  return (
    <Suspense>
      <MonthView />
    </Suspense>
  );
}
