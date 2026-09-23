import { NextResponse } from "next/server";
import {
  RequestValidationError,
  parseQuickCaptureCommand,
} from "@/app/lib/finance-v1-contracts";
import {
  QuickCaptureError,
  recordQuickCapture,
} from "@/app/lib/finance-quick-capture-service";
import { CardProvisionalError } from "@/app/lib/ledger-card-provisional-service";
import { LedgerInvariantError } from "@/app/lib/ledger";

function errorResponse(error: unknown) {
  if (error instanceof RequestValidationError || error instanceof LedgerInvariantError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 }
    );
  }
  if (error instanceof QuickCaptureError || error instanceof CardProvisionalError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error("finance_v1_quick_capture_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new RequestValidationError("Body must be valid JSON");
    }
    const result = await recordQuickCapture(parseQuickCaptureCommand(body));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
