import { Suspense } from "react";
import { MovementsView } from "@/app/components/finance/ux/MovementsView";

export default function Page() {
  return (
    <Suspense>
      <MovementsView />
    </Suspense>
  );
}
