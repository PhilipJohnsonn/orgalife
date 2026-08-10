import { NextResponse } from "next/server";

import {
  RequestValidationError,
  parseCardPaymentCommand,
} from "@/app/lib/finance-v1-contracts";
import { cardFinanceErrorResponse } from "@/app/lib/finance-v1-card-errors";
import {
  getCardPaymentState,
  recordCardPayment,
} from "@/app/lib/ledger-card-payment-service";

export async function GET(request: Request) {
  try {
    const statementId = new URL(request.url).searchParams.get("statementId");
    if (!statementId) throw new RequestValidationError("statementId is required");
    return NextResponse.json(await getCardPaymentState(statementId));
  } catch (error) {
    return cardFinanceErrorResponse(error, "finance_v1_card_payment_state_failed");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const result = await recordCardPayment(parseCardPaymentCommand(body));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return cardFinanceErrorResponse(error, "finance_v1_card_payment_failed");
  }
}
