import assert from "node:assert/strict";
import test from "node:test";

import {
  FinancePdfUploadError,
  MAX_FINANCE_PDF_BYTES,
  validateFinancePdfUpload,
} from "./finance-pdf-upload.ts";

const valid = {
  name: "statement.pdf",
  type: "application/pdf",
  size: 100,
  header: new TextEncoder().encode("%PDF-"),
};

test("accepts a PDF within the upload limit", () => {
  assert.doesNotThrow(() => validateFinancePdfUpload(valid));
});

test("rejects empty, oversized and non-PDF uploads with stable statuses", () => {
  const cases = [
    [{ ...valid, size: 0 }, 400, "PDF_EMPTY"],
    [{ ...valid, size: MAX_FINANCE_PDF_BYTES + 1 }, 413, "PDF_TOO_LARGE"],
    [{ ...valid, name: "statement.txt" }, 415, "PDF_EXTENSION_REQUIRED"],
    [{ ...valid, type: "text/plain" }, 415, "PDF_MIME_REQUIRED"],
    [{ ...valid, header: new TextEncoder().encode("hello") }, 415, "PDF_SIGNATURE_REQUIRED"],
  ];

  for (const [input, status, code] of cases) {
    assert.throws(
      () => validateFinancePdfUpload(input),
      (error) =>
        error instanceof FinancePdfUploadError &&
        error.status === status &&
        error.code === code,
      code
    );
  }
});
