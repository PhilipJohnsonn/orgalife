import { NextResponse } from "next/server";
import { RequestValidationError } from "@/app/lib/finance-v1-contracts";
import { readJsonObject, settingsErrorResponse } from "@/app/lib/finance-route-errors";
import { removeAccount, renameAccount } from "@/app/lib/finance-settings-service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const body = await readJsonObject(request);
    if (typeof body.name !== "string") throw new RequestValidationError("name is required");
    const account = await renameAccount((await params).id, body.name);
    return NextResponse.json({ id: account.id, name: account.name });
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_account_update_failed");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    return NextResponse.json(await removeAccount((await params).id));
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_account_delete_failed");
  }
}
