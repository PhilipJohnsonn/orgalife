import { NextResponse } from "next/server";

import { RequestValidationError } from "@/app/lib/finance-v1-contracts";
import { cardFinanceErrorResponse } from "@/app/lib/finance-v1-card-errors";
import {
  dismissProvisionalCardPurchase,
  supersedeProvisionalCardPurchase,
} from "@/app/lib/ledger-card-provisional-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const { id } = await params;
    if (body?.action === "DISMISS" && typeof body.reason === "string") {
      const entry = await dismissProvisionalCardPurchase({
        entryId: id,
        reason: body.reason,
      });
      return NextResponse.json({ id: entry.id, status: entry.status });
    }
    if (
      body?.action === "SUPERSEDE" &&
      Array.isArray(body.statementLineIds) &&
      body.statementLineIds.every((value) => typeof value === "string")
    ) {
      const entry = await supersedeProvisionalCardPurchase({
        entryId: id,
        statementLineIds: body.statementLineIds as string[],
      });
      return NextResponse.json({ id: entry.id, status: entry.status });
    }
    throw new RequestValidationError("Invalid provisional action");
  } catch (error) {
    return cardFinanceErrorResponse(error, "finance_v1_card_provisional_action_failed");
  }
}
