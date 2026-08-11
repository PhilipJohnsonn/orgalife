import { NextResponse } from "next/server";

import {
  createCategoryRule,
  FinanceCategoryError,
} from "@/app/lib/finance-category-service";
import {
  parseCategoryRuleCommand,
  RequestValidationError,
} from "@/app/lib/finance-v1-contracts";

export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await createCategoryRule(parseCategoryRuleCommand(await request.json())),
      { status: 201 }
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
    console.error("finance_v1_category_rule_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
