import { NextResponse } from "next/server";
import { CurrencyError } from "@/app/lib/finance-currencies";
import { enableCurrency, listEnabledCurrencies } from "@/app/lib/finance-currency-service";

function errorResponse(error: unknown) {
  if (error instanceof CurrencyError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error("finance_v1_currencies_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return NextResponse.json(await listEnabledCurrencies());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const code = await enableCurrency(body && typeof body === "object" ? body.code : undefined);
    return NextResponse.json({ code }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
