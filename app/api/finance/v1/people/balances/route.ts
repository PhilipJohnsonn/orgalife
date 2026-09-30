import { NextResponse } from "next/server";
import { listPeopleBalances } from "@/app/lib/finance-person-service";
import { settingsErrorResponse } from "@/app/lib/finance-route-errors";

export async function GET() {
  try {
    return NextResponse.json(await listPeopleBalances());
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_people_balances_failed");
  }
}
