import { NextResponse } from "next/server";
import {
  RequestValidationError,
  parseCreateAccountCommand,
} from "@/app/lib/finance-v1-contracts";
import { LedgerInvariantError } from "@/app/lib/ledger";
import {
  createAccountWithGroup,
  getNativeAccountBalances,
} from "@/app/lib/ledger-account-service";

function errorResponse(error: unknown) {
  if (error instanceof RequestValidationError || error instanceof LedgerInvariantError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 }
    );
  }
  console.error("finance_v1_account_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return NextResponse.json(await getNativeAccountBalances());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
      { status: 400 }
    );
  }

  try {
    const command = parseCreateAccountCommand(body);
    const result = await createAccountWithGroup({
      group: {
        name: command.groupName,
        region: command.region,
        type: command.groupType,
      },
      name: command.accountName,
      currency: command.currency,
      kind: command.groupType === "CARD" ? "LIABILITY" : "ASSET",
      subtype: command.groupType,
      trackingMode: command.trackingMode,
      openingBalance: command.openingBalance,
      openingOn: command.openingOn,
    });
    return NextResponse.json({ id: result.account.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
