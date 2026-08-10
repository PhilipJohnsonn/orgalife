import { NextResponse } from "next/server";
import { listFinanceMovements } from "@/app/lib/ledger-transfer-service";

export async function GET() {
  try {
    return NextResponse.json(await listFinanceMovements());
  } catch (error) {
    console.error("finance_v1_movements_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
