import { NextResponse } from "next/server";

import { RequestValidationError } from "@/app/lib/finance-v1-contracts";
import { cardFinanceErrorResponse } from "@/app/lib/finance-v1-card-errors";
import { reverseCardStatement } from "@/app/lib/ledger-card-confirmation-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.occurredOn !== "string") {
      throw new RequestValidationError("occurredOn must use YYYY-MM-DD");
    }
    const { id } = await params;
    return NextResponse.json(
      await reverseCardStatement({ statementId: id, occurredOn: body.occurredOn })
    );
  } catch (error) {
    return cardFinanceErrorResponse(error, "finance_v1_statement_reverse_failed");
  }
}
