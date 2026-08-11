import { NextResponse } from "next/server";

import { RequestValidationError } from "@/app/lib/finance-v1-contracts";
import { CardStatementConfirmationError } from "@/app/lib/ledger-card-confirmation-service";
import { CardPaymentError } from "@/app/lib/ledger-card-payment-service";
import { CardProvisionalError } from "@/app/lib/ledger-card-provisional-service";

export function cardFinanceErrorResponse(error: unknown, logKey: string) {
  if (error instanceof RequestValidationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 }
    );
  }
  if (
    error instanceof CardStatementConfirmationError ||
    error instanceof CardPaymentError
  ) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status }
    );
  }
  if (error instanceof CardProvisionalError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error(logKey, error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}
