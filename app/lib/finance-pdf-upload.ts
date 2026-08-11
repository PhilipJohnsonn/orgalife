export const MAX_FINANCE_PDF_BYTES = 10 * 1024 * 1024;

export type FinancePdfUploadErrorCode =
  | "PDF_EMPTY"
  | "PDF_TOO_LARGE"
  | "PDF_EXTENSION_REQUIRED"
  | "PDF_MIME_REQUIRED"
  | "PDF_SIGNATURE_REQUIRED";

export class FinancePdfUploadError extends Error {
  readonly code: FinancePdfUploadErrorCode;
  readonly status: 400 | 413 | 415;

  constructor(
    code: FinancePdfUploadErrorCode,
    status: 400 | 413 | 415,
    message: string
  ) {
    super(message);
    this.name = "FinancePdfUploadError";
    this.code = code;
    this.status = status;
  }
}

export function validateFinancePdfUpload(input: {
  name: string;
  type: string;
  size: number;
  header: Uint8Array;
}) {
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new FinancePdfUploadError("PDF_EMPTY", 400, "The PDF is empty");
  }
  if (input.size > MAX_FINANCE_PDF_BYTES) {
    throw new FinancePdfUploadError(
      "PDF_TOO_LARGE",
      413,
      "The PDF exceeds the 10 MiB limit"
    );
  }
  if (!input.name.toLowerCase().endsWith(".pdf")) {
    throw new FinancePdfUploadError(
      "PDF_EXTENSION_REQUIRED",
      415,
      "The file must use the .pdf extension"
    );
  }
  if (input.type.toLowerCase() !== "application/pdf") {
    throw new FinancePdfUploadError(
      "PDF_MIME_REQUIRED",
      415,
      "The file must use the application/pdf MIME type"
    );
  }
  if (new TextDecoder("ascii").decode(input.header.slice(0, 5)) !== "%PDF-") {
    throw new FinancePdfUploadError(
      "PDF_SIGNATURE_REQUIRED",
      415,
      "The file does not have a valid PDF signature"
    );
  }
}
