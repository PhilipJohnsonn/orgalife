import { NextResponse } from "next/server";
import {
  RequestValidationError,
  parseManualRateCommand,
} from "@/app/lib/finance-v1-contracts";
import { LedgerInvariantError } from "@/app/lib/ledger";
import {
  createManualUsdRate,
  getCurrentUsdRates,
} from "@/app/lib/exchange-rate-service";

function errorResponse(error: unknown) {
  if (error instanceof RequestValidationError || error instanceof LedgerInvariantError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 }
    );
  }
  console.error("finance_v1_rate_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const currencies = (url.searchParams.get("currencies") ?? "ARS,AUD")
      .split(",")
      .filter(Boolean);
    const rates = await getCurrentUsdRates(currencies);
    return NextResponse.json(
      [...rates.values()].map((snapshot) => ({
        id: snapshot.id,
        baseCurrency: snapshot.baseCurrency.trim(),
        quoteCurrency: snapshot.quoteCurrency.trim(),
        rate: snapshot.rate.toFixed(8),
        provider: snapshot.provider,
        observedAt: snapshot.observedAt.toISOString(),
        appliedOn: snapshot.appliedOn.toISOString().slice(0, 10),
        isManualOverride: snapshot.isManualOverride,
      }))
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new RequestValidationError("Body must be valid JSON");
    }
    const snapshot = await createManualUsdRate(parseManualRateCommand(body));
    return NextResponse.json({ id: snapshot.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
