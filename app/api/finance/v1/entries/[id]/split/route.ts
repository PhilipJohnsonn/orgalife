import { NextResponse } from "next/server";
import { settingsErrorResponse } from "@/app/lib/finance-route-errors";
import { splitExistingEntry } from "@/app/lib/ledger-shared-expense-service";
import { parseSplit } from "@/app/lib/shared-expense";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const body = await request.json().catch(() => null);
    const entry = await splitExistingEntry((await params).id, parseSplit(body?.split));
    return NextResponse.json(
      { id: entry.id, occurredOn: entry.occurredOn.toISOString().slice(0, 10), metadata: entry.metadata },
      { status: 201 }
    );
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_entry_split_failed");
  }
}
