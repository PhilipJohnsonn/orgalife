import { NextResponse } from "next/server";
import { CardPaymentError, parseCardPaymentCommand } from "@/app/lib/finance-card-payment";
import { settingsErrorResponse } from "@/app/lib/finance-route-errors";
import { getCardDebts, recordCardPayment } from "@/app/lib/ledger-card-payment-service";

/** GET ?cardGroupId=…&closingOn=YYYY-MM-DD: debt per currency for that statement. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cardGroupId = url.searchParams.get("cardGroupId")?.trim();
    const closingOn = url.searchParams.get("closingOn")?.trim();
    if (!cardGroupId || !closingOn || !/^\d{4}-\d{2}-\d{2}$/.test(closingOn)) {
      throw new CardPaymentError("INVALID_PAYLOAD", 400, "cardGroupId y closingOn (YYYY-MM-DD) son obligatorios");
    }
    return NextResponse.json(await getCardDebts(cardGroupId, closingOn));
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_card_debts_failed");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const result = await recordCardPayment(parseCardPaymentCommand(body));
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_card_payment_failed");
  }
}
