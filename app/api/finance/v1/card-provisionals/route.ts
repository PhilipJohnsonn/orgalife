import { NextResponse } from "next/server";

import { parseProvisionalCardPurchaseCommand } from "@/app/lib/finance-v1-contracts";
import { cardFinanceErrorResponse } from "@/app/lib/finance-v1-card-errors";
import {
  listProvisionalCardPurchases,
  recordProvisionalCardPurchase,
} from "@/app/lib/ledger-card-provisional-service";

export async function GET() {
  try {
    return NextResponse.json(await listProvisionalCardPurchases());
  } catch (error) {
    return cardFinanceErrorResponse(error, "finance_v1_card_provisionals_failed");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const entry = await recordProvisionalCardPurchase(
      parseProvisionalCardPurchaseCommand(body)
    );
    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) {
    return cardFinanceErrorResponse(error, "finance_v1_card_provisional_failed");
  }
}
