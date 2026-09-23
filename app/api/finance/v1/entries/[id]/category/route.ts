import { NextResponse } from "next/server";
import {
  RequestValidationError,
  parseCategorizeStatementLineCommand,
} from "@/app/lib/finance-v1-contracts";
import { FinanceCategoryError } from "@/app/lib/finance-category-service";
import { setEntryCategory } from "@/app/lib/finance-month-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => null);
    const command = parseCategorizeStatementLineCommand(body);
    return NextResponse.json(await setEntryCategory((await params).id, command));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 400 }
      );
    }
    if (error instanceof FinanceCategoryError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_entry_category_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
