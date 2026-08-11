import { NextResponse } from "next/server";

import {
  cancelRecurringCommitment,
  FinanceCommitmentError,
} from "@/app/lib/finance-commitment-service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return NextResponse.json(
      await cancelRecurringCommitment((await params).id)
    );
  } catch (error) {
    if (error instanceof FinanceCommitmentError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_commitment_cancel_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
