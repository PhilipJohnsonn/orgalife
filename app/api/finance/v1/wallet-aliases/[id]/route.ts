import { NextResponse } from "next/server";
import {
  QuickCaptureError,
  deleteWalletCardAlias,
  updateWalletCardAlias,
} from "@/app/lib/finance-quick-capture-service";

function errorResponse(error: unknown) {
  if (error instanceof QuickCaptureError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error("finance_v1_wallet_alias_update_failed", error instanceof Error ? error.name : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body !== "object" ||
      (body.label !== undefined && typeof body.label !== "string") ||
      (body.ledgerAccountId !== undefined && typeof body.ledgerAccountId !== "string")
    ) {
      return NextResponse.json(
        { error: { code: "INVALID_PAYLOAD", message: "label and ledgerAccountId must be strings" } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await updateWalletCardAlias((await params).id, {
        label: body.label,
        ledgerAccountId: body.ledgerAccountId,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await deleteWalletCardAlias((await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof QuickCaptureError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_wallet_alias_delete_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
