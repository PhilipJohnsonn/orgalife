import { NextResponse } from "next/server";
import { getQuickCaptureOptions } from "@/app/lib/finance-quick-capture-service";

export async function GET() {
  try {
    return NextResponse.json(await getQuickCaptureOptions());
  } catch (error) {
    console.error("finance_v1_quick_capture_options_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
