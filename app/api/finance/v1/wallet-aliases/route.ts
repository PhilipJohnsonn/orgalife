import { NextResponse } from "next/server";
import {
  QuickCaptureError,
  createWalletCardAlias,
  listWalletCardAliases,
} from "@/app/lib/finance-quick-capture-service";

function errorResponse(error: unknown) {
  if (error instanceof QuickCaptureError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error("finance_v1_wallet_alias_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return NextResponse.json(await listWalletCardAliases());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.label !== "string" ||
      typeof body.ledgerAccountId !== "string"
    ) {
      return NextResponse.json(
        { error: { code: "INVALID_PAYLOAD", message: "label and ledgerAccountId are required" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await createWalletCardAlias({ label: body.label, ledgerAccountId: body.ledgerAccountId }),
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
