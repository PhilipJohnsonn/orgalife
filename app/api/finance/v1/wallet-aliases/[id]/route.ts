import { NextResponse } from "next/server";
import {
  QuickCaptureError,
  deleteWalletCardAlias,
} from "@/app/lib/finance-quick-capture-service";

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
