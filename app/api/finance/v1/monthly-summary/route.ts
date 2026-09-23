import { NextResponse } from "next/server";
import { FinanceCategoryError } from "@/app/lib/finance-category-service";
import { getMonthlySummary } from "@/app/lib/finance-month-service";

export async function GET(request: Request) {
  try {
    const month =
      new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    return NextResponse.json(await getMonthlySummary(month));
  } catch (error) {
    if (error instanceof FinanceCategoryError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_monthly_summary_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
