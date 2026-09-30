import { NextResponse } from "next/server";
import { parsePersonSettlementCommand } from "@/app/lib/finance-people";
import { settingsErrorResponse } from "@/app/lib/finance-route-errors";
import { recordPersonSettlement } from "@/app/lib/ledger-shared-expense-service";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const entry = await recordPersonSettlement(parsePersonSettlementCommand(body));
    return NextResponse.json(
      { id: entry.id, occurredOn: entry.occurredOn.toISOString().slice(0, 10), description: entry.description, metadata: entry.metadata },
      { status: 201 }
    );
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_person_settlement_failed");
  }
}
