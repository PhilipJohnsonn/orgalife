import { NextResponse } from "next/server";

import { RequestValidationError } from "@/app/lib/finance-v1-contracts";
import { cardFinanceErrorResponse } from "@/app/lib/finance-v1-card-errors";
import { allocateExistingCardPayment } from "@/app/lib/ledger-card-payment-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (
      !body ||
      typeof body.statementId !== "string" ||
      typeof body.journalEntryId !== "string" ||
      typeof body.amount !== "string"
    ) {
      throw new RequestValidationError(
        "statementId, journalEntryId and decimal string amount are required"
      );
    }
    const allocation = await allocateExistingCardPayment({
      statementId: body.statementId,
      journalEntryId: body.journalEntryId,
      amount: body.amount,
    });
    return NextResponse.json({ id: allocation.id }, { status: 201 });
  } catch (error) {
    return cardFinanceErrorResponse(error, "finance_v1_card_payment_allocation_failed");
  }
}
