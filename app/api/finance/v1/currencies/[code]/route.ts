import { NextResponse } from "next/server";
import { CurrencyError } from "@/app/lib/finance-currencies";
import { disableCurrency } from "@/app/lib/finance-currency-service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    await disableCurrency((await params).code);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CurrencyError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_currency_delete_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
