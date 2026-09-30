import { NextResponse } from "next/server";
import { createPerson, listPeople } from "@/app/lib/finance-person-service";
import { settingsErrorResponse } from "@/app/lib/finance-route-errors";

export async function GET() {
  try {
    return NextResponse.json(await listPeople());
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_people_failed");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const person = await createPerson(body && typeof body === "object" ? body.name : undefined);
    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_person_create_failed");
  }
}
