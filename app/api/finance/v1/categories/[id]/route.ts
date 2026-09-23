import { NextResponse } from "next/server";
import { RequestValidationError } from "@/app/lib/finance-v1-contracts";
import { readJsonObject, settingsErrorResponse } from "@/app/lib/finance-route-errors";
import { deleteCategory, updateCategory } from "@/app/lib/finance-settings-service";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const body = await readJsonObject(request);
    if (
      (body.name !== undefined && typeof body.name !== "string") ||
      (body.color !== undefined && typeof body.color !== "string")
    ) {
      throw new RequestValidationError("name and color must be strings");
    }
    return NextResponse.json(
      await updateCategory((await params).id, {
        name: body.name as string | undefined,
        color: body.color as string | undefined,
      })
    );
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_category_update_failed");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    await deleteCategory((await params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_category_delete_failed");
  }
}
