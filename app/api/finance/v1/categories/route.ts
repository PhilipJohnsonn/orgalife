import { NextResponse } from "next/server";

import {
  createFinanceCategory,
  FinanceCategoryError,
  listCategoriesAndRules,
} from "@/app/lib/finance-category-service";

export async function GET() {
  return NextResponse.json(await listCategoriesAndRules());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || typeof body.name !== "string") {
      return NextResponse.json(
        { error: { code: "INVALID_PAYLOAD", message: "name is required" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await createFinanceCategory({
        name: body.name,
        color: typeof body.color === "string" ? body.color : undefined,
      }),
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof FinanceCategoryError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_category_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
