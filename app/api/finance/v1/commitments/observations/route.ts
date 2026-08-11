import { NextResponse } from "next/server";

import {
  FinanceCommitmentError,
  linkCommitmentObservation,
  unlinkCommitmentObservation,
} from "@/app/lib/finance-commitment-service";

function validBody(body: unknown): body is { commitmentId: string; statementLineId: string } {
  return Boolean(
    body &&
      typeof body === "object" &&
      typeof (body as Record<string, unknown>).commitmentId === "string" &&
      typeof (body as Record<string, unknown>).statementLineId === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!validBody(body)) {
      return NextResponse.json(
        { error: { code: "INVALID_PAYLOAD", message: "commitmentId and statementLineId are required" } },
        { status: 400 }
      );
    }
    return NextResponse.json(await linkCommitmentObservation(body));
  } catch (error) {
    if (error instanceof FinanceCommitmentError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    console.error("finance_v1_commitment_link_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const statementLineId = url.searchParams.get("statementLineId")?.trim();
  if (!statementLineId) {
    return NextResponse.json(
      { error: { code: "INVALID_PAYLOAD", message: "statementLineId is required" } },
      { status: 400 }
    );
  }
  return NextResponse.json(await unlinkCommitmentObservation(statementLineId));
}
