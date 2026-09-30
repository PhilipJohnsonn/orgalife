import { NextResponse } from "next/server";
import { settingsErrorResponse } from "@/app/lib/finance-route-errors";
import { recordSharedExpense } from "@/app/lib/ledger-shared-expense-service";
import { parseSharedExpenseCommand } from "@/app/lib/shared-expense";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const entry = await recordSharedExpense(parseSharedExpenseCommand(body));
    return NextResponse.json(
      { id: entry.id, occurredOn: entry.occurredOn.toISOString().slice(0, 10), metadata: entry.metadata },
      { status: 201 }
    );
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_shared_expense_failed");
  }
}
