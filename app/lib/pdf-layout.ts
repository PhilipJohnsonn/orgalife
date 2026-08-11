import { join } from "node:path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import type { IcbcVisaLayoutItem } from "./icbc-visa-parser";

export async function extractPdfLayoutItems(buffer: Uint8Array) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
  const document = await pdfjsLib.getDocument({ data: buffer }).promise;
  const items: IcbcVisaLayoutItem[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [, , , , x, y] = item.transform as number[];
        items.push({
          page: pageNumber,
          str: item.str.trim(),
          x: Math.round(x),
          y: Math.round(y),
        });
      }
    }
  } finally {
    await document.destroy();
  }

  return items;
}
