import { NextResponse } from "next/server";
import { listPeopleHistory } from "@/app/lib/finance-person-service";
import { settingsErrorResponse } from "@/app/lib/finance-route-errors";

export async function GET() {
  try {
    return NextResponse.json(await listPeopleHistory());
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_people_history_failed");
  }
}
