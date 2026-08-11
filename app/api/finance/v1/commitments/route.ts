import { NextResponse } from "next/server";

import {
  createRecurringCommitment,
  FinanceCommitmentError,
  listRecurringCommitments,
} from "@/app/lib/finance-commitment-service";
import {
  parseRecurringCommitmentCommand,
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
  if (error instanceof FinanceCommitmentError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error("finance_v1_commitment_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return NextResponse.json(await listRecurringCommitments());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await createRecurringCommitment(
        parseRecurringCommitmentCommand(await request.json())
      ),
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
