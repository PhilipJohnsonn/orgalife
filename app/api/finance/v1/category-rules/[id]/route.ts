import { NextResponse } from "next/server";

import {
  FinanceCategoryError,
  setCategoryRuleActive,
} from "@/app/lib/finance-category-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || typeof body.isActive !== "boolean") {
      return NextResponse.json(
        { error: { code: "INVALID_PAYLOAD", message: "isActive must be boolean" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await setCategoryRuleActive((await params).id, body.isActive)
    );
  } catch (error) {
    if (error instanceof FinanceCategoryError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_category_rule_update_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
