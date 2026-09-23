import { NextResponse } from "next/server";
import { RequestValidationError } from "@/app/lib/finance-v1-contracts";
import { readJsonObject, settingsErrorResponse } from "@/app/lib/finance-route-errors";
import { updateAccountBalance } from "@/app/lib/finance-settings-service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await readJsonObject(request);
    if (typeof body.balance !== "string" || !/^-?\d{1,16}(?:\.\d{1,2})?$/.test(body.balance)) {
      throw new RequestValidationError("balance must be a decimal string");
    }
    if (typeof body.occurredOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.occurredOn)) {
      throw new RequestValidationError("occurredOn must use YYYY-MM-DD");
    }
    if (typeof body.idempotencyKey !== "string" || !UUID_PATTERN.test(body.idempotencyKey)) {
      throw new RequestValidationError("idempotencyKey must be a UUID");
    }
    return NextResponse.json(
      await updateAccountBalance((await params).id, {
        balance: body.balance,
        occurredOn: body.occurredOn,
        idempotencyKey: body.idempotencyKey,
      })
    );
  } catch (error) {
    return settingsErrorResponse(error, "finance_v1_account_balance_failed");
  }
}
