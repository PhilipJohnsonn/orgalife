import { NextResponse } from "next/server";

import { cardFinanceErrorResponse } from "@/app/lib/finance-v1-card-errors";
import { confirmCardStatement } from "@/app/lib/ledger-card-confirmation-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return NextResponse.json(await confirmCardStatement(id));
  } catch (error) {
    return cardFinanceErrorResponse(error, "finance_v1_statement_confirm_failed");
  }
}
