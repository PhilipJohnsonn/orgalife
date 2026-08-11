import { NextResponse } from "next/server";

import {
  categorizeStatementLine,
  FinanceCategoryError,
} from "@/app/lib/finance-category-service";
import {
  parseCategorizeStatementLineCommand,
  RequestValidationError,
} from "@/app/lib/finance-v1-contracts";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return NextResponse.json(
      await categorizeStatementLine(
        (await params).id,
        parseCategorizeStatementLineCommand(await request.json())
      )
    );
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
    console.error("finance_v1_statement_category_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
