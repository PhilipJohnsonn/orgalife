import { NextResponse } from "next/server";
import {
  getFinanceOverview,
  type FinanceRegion,
} from "@/app/lib/finance-overview-service";
import { LedgerInvariantError } from "@/app/lib/ledger";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const region = url.searchParams.get("region") ?? "GLOBAL";
    if (!(["ARGENTINA", "AUSTRALIA", "GLOBAL"] as string[]).includes(region)) {
      return NextResponse.json(
        { error: { code: "INVALID_PAYLOAD", message: "region is invalid" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await getFinanceOverview({
        region: region as FinanceRegion,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
      })
    );
  } catch (error) {
    if (error instanceof LedgerInvariantError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 }
      );
    }
    console.error("finance_v1_overview_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
