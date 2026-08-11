import { NextResponse } from "next/server";

import {
  createObligation,
  FinanceObligationError,
  listObligations,
} from "@/app/lib/finance-obligation-service";
import {
  parseCreateObligationCommand,
  RequestValidationError,
} from "@/app/lib/finance-v1-contracts";
import { LedgerInvariantError } from "@/app/lib/ledger";

function errorResponse(error: unknown) {
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
  console.error("finance_v1_obligation_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return NextResponse.json(await listObligations());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await createObligation(parseCreateObligationCommand(await request.json())),
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
