import { NextResponse } from "next/server";
import {
  RequestValidationError,
  parseFxCommand,
} from "@/app/lib/finance-v1-contracts";
import { LedgerInvariantError } from "@/app/lib/ledger";
import { recordFx } from "@/app/lib/ledger-transfer-service";

function errorResponse(error: unknown) {
  if (error instanceof RequestValidationError || error instanceof LedgerInvariantError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 }
    );
  }
  console.error("finance_v1_fx_failed", error instanceof Error ? error.name : "unknown");
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
    const entry = await recordFx(parseFxCommand(body));
    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
