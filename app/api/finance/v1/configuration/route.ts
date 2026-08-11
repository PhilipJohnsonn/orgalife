import { NextResponse } from "next/server";
import {
  RequestValidationError,
  parseBaseCurrencyCommand,
} from "@/app/lib/finance-v1-contracts";
import { LedgerInvariantError } from "@/app/lib/ledger";
import {
  getFinanceConfiguration,
  setFinanceBaseCurrency,
} from "@/app/lib/exchange-rate-service";

function response(configuration: { baseCurrency: string }) {
  return NextResponse.json({ baseCurrency: configuration.baseCurrency.trim() });
}
function errorResponse(error: unknown) {
  if (error instanceof RequestValidationError || error instanceof LedgerInvariantError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 }
    );
  }
  console.error("finance_v1_configuration_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return response(await getFinanceConfiguration());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new RequestValidationError("Body must be valid JSON");
    }
    const { baseCurrency } = parseBaseCurrencyCommand(body);
    return response(await setFinanceBaseCurrency(baseCurrency));
  } catch (error) {
    return errorResponse(error);
  }
}
