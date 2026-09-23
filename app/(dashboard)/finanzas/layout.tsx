import { Suspense } from "react";
import { FinanceNav } from "@/app/components/finance/ux/FinanceNav";
import { QuickAdd } from "@/app/components/finance/ux/QuickAdd";

export default function FinanzasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Suspense>
        <FinanceNav variant="top" />
      </Suspense>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 md:pb-8">{children}</div>
      <Suspense>
        <FinanceNav variant="bottom" />
      </Suspense>
      <QuickAdd />
    </div>
  );
}
