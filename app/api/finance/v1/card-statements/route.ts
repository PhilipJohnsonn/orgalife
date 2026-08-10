import { NextResponse } from "next/server";

import {
  FinancePdfUploadError,
  validateFinancePdfUpload,
} from "@/app/lib/finance-pdf-upload";
import { IcbcVisaParserError } from "@/app/lib/icbc-visa-parser";
import {
  CardStatementDraftError,
  createOrReuseCardStatementDraft,
  deleteAbandonedCardStatementDrafts,
  listCardStatements,
} from "@/app/lib/ledger-card-statement-service";
import { extractPdfLayoutItems } from "@/app/lib/pdf-layout";

function errorResponse(error: unknown) {
  if (error instanceof FinancePdfUploadError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  if (error instanceof CardStatementDraftError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          existingStatementId: error.existingStatementId,
        },
      },
      { status: error.status }
    );
  }
  if (error instanceof IcbcVisaParserError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 422 }
    );
  }
  console.error(
    "finance_v1_card_statement_failed",
    error instanceof Error ? error.name : "unknown"
  );
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 }
  );
}

export async function GET() {
  try {
    return NextResponse.json(await listCardStatements());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: { code: "INVALID_FORM_DATA", message: "Invalid multipart form data" } },
        { status: 400 }
      );
    }

    const files = formData.getAll("file");
    if (files.length !== 1 || !(files[0] instanceof File)) {
      return NextResponse.json(
        { error: { code: "ONE_PDF_REQUIRED", message: "Exactly one PDF is required" } },
        { status: 400 }
      );
    }
    const cardGroupId = formData.get("cardGroupId");
    if (typeof cardGroupId !== "string" || !cardGroupId.trim()) {
      return NextResponse.json(
        { error: { code: "CARD_GROUP_REQUIRED", message: "cardGroupId is required" } },
        { status: 400 }
      );
    }

    const file = files[0];
    validateFinancePdfUpload({
      name: file.name,
      type: file.type,
      size: file.size,
      header: new Uint8Array(await file.slice(0, 5).arrayBuffer()),
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let layoutItems;
    try {
      layoutItems = await extractPdfLayoutItems(bytes);
    } catch (error) {
      console.error(
        "finance_v1_card_statement_pdf_parse_failed",
        error instanceof Error ? error.name : "unknown"
      );
      return NextResponse.json(
        { error: { code: "PDF_PARSE_FAILED", message: "The PDF could not be parsed" } },
        { status: 422 }
      );
    }

    const statement = await createOrReuseCardStatementDraft({
      cardGroupId,
      documentBytes: bytes,
      layoutItems,
    });
    return NextResponse.json(statement, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const result = await deleteAbandonedCardStatementDrafts();
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    return errorResponse(error);
  }
}
