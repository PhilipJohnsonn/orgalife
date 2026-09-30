import { NextResponse } from "next/server";
import { removePerson, renamePerson } from "@/app/lib/finance-person-service";
import { settingsErrorResponse } from "@/app/lib/finance-route-errors";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const body = await request.json().catch(() => null);
    return NextResponse.json(await renamePerson((await params).id, body && typeof body === "object" ? body.name : undefined));
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_person_update_failed");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    return NextResponse.json(await removePerson((await params).id));
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_person_delete_failed");
  }
}
