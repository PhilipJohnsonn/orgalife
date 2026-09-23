import { NextResponse } from "next/server";
import { FinanceCategoryError } from "@/app/lib/finance-category-service";
import { RequestValidationError } from "@/app/lib/finance-v1-contracts";
import { LedgerInvariantError } from "@/app/lib/ledger";

export function settingsErrorResponse(error: unknown, logKey: string) {
  if (error instanceof RequestValidationError || error instanceof LedgerInvariantError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 400 });
  }
  if (error instanceof FinanceCategoryError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  console.error(logKey, error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function readJsonObject(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Body must be an object");
  }
  return body as Record<string, unknown>;
}
