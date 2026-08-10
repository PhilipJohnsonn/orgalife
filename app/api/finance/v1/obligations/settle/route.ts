import { NextResponse } from "next/server";

import {
  FinanceObligationError,
  settleObligation,
} from "@/app/lib/finance-obligation-service";
import {
  parseSettleObligationCommand,
  RequestValidationError,
} from "@/app/lib/finance-v1-contracts";
import { LedgerInvariantError } from "@/app/lib/ledger";

export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await settleObligation(parseSettleObligationCommand(await request.json()))
    );
  } catch (error) {
    if (error instanceof RequestValidationError || error instanceof LedgerInvariantError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 }
      );
    }
    if (error instanceof FinanceObligationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_obligation_settlement_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
