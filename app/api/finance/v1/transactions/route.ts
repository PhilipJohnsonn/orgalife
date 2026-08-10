import { NextResponse } from "next/server";
import {
  RequestValidationError,
  parseIncomeExpenseCommand,
} from "@/app/lib/finance-v1-contracts";
import { LedgerInvariantError } from "@/app/lib/ledger";
import {
  listIncomeExpenses,
  recordIncomeExpense,
} from "@/app/lib/ledger-cash-flow-service";

function errorResponse(error: unknown) {
  if (error instanceof RequestValidationError || error instanceof LedgerInvariantError) {
    return NextResponse.json(
      { error: { code: error instanceof RequestValidationError ? error.code : error.code, message: error.message } },
      { status: 400 }
    );
  }

  console.error("finance_v1_transaction_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return NextResponse.json(await listIncomeExpenses());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new RequestValidationError("Body must be valid JSON");
    }

    const command = parseIncomeExpenseCommand(body);
    const entry = await recordIncomeExpense(command);
    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
