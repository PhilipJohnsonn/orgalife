import { NextRequest } from "next/server";
import { join } from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const TAX_KEYWORDS = [
  "PERCEP", "IMP PAIS", "IMP AL VALOR", "IMPUESTO", "SELLO",
  "INTERES", "CARGO FINANCIERO", "RECARGO", "COMISION",
  "RG 5617", "DB.RG", "RG 4815",
];

const KNOWN_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "THB", "JPY", "BRL", "CLP", "MXN",
  "UYU", "PEN", "COP", "CHF", "CAD", "AUD", "CNY", "IDR",
  "SGD", "HKD", "NZD", "SEK", "NOK", "DKK", "PLN", "CZK",
]);

function isTaxLine(description: string): boolean {
  const upper = description.toUpperCase();
  return TAX_KEYWORDS.some((kw) => upper.includes(kw));
}

interface ParsedExpense {
  description: string;
  installmentInfo: string | null;
  originalCurrency: string | null;
  originalAmount: number | null;
  amountARS: number | null;
  amountUSD: number | null;
  isExcluded: boolean;
  excludeReason: string | null;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/-$/, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) || n <= 0 ? null : n;
}

function isNumericStr(str: string): boolean {
  return /^[\d.,]+-?$/.test(str.trim()) && str.trim().length > 0;
}

// Amounts in ICBC PDFs always use comma as decimal separator (e.g. "7.268,84", "2,65").
// Pure integers like account numbers ("1163874947", "015") are excluded.
function isAmountStr(str: string): boolean {
  return isNumericStr(str) && str.includes(",");
}

async function extractItems(buffer: Buffer): Promise<TextItem[]> {
  pdfjsLib.GlobalWorkerOptions.workerSrc = join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
  );
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const items: TextItem[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    for (const item of tc.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      items.push({ str: item.str.trim(), x: Math.round(x), y: Math.round(y) });
    }
  }
  return items;
}

function groupByRow(items: TextItem[], tolerance = 4): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  let current: TextItem[] = [];
  let currentY = NaN;
  for (const item of sorted) {
    if (isNaN(currentY) || Math.abs(item.y - currentY) <= tolerance) {
      current.push(item);
      if (isNaN(currentY)) currentY = item.y;
    } else {
      if (current.length) rows.push(current);
      current = [item];
      currentY = item.y;
    }
  }
  if (current.length) rows.push(current);
  return rows;
}

function deduplicateItems(row: TextItem[]): TextItem[] {
  // ICBC PDFs render each row twice at slightly different X positions.
  // Deduplicate by rounding X to nearest 5px bucket + matching text.
  const seen = new Set<string>();
  const result: TextItem[] = [];
  for (const item of row.sort((a, b) => a.x - b.x)) {
    const key = `${Math.round(item.x / 5) * 5}:${item.str}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function resolveAmounts(row: TextItem[]): { amountARS: number | null; amountUSD: number | null } | null {
  // ARS column: x ≈ [380, 520)
  const arsItems = row.filter((i) => i.x >= 380 && i.x < 520 && isAmountStr(i.str) && !i.str.endsWith("-"));
  // USD column: x > 520, non-zero
  const usdItems = row.filter(
    (i) => i.x > 520 && isAmountStr(i.str) && !i.str.endsWith("-") && i.str !== "0,00" && i.str !== "0.00"
  );

  const arsItem = arsItems.length > 0 ? arsItems[arsItems.length - 1] : null;
  const usdItem = usdItems.length > 0 ? usdItems[usdItems.length - 1] : null;

  if (!arsItem && !usdItem) return null;

  // When USD is present it's a foreign/USD purchase — take USD and discard ARS equivalent.
  // When only ARS is present it's a peso purchase.
  const amountUSD = usdItem ? parseAmount(usdItem.str) : null;
  const amountARS = !usdItem && arsItem ? parseAmount(arsItem.str) : null;

  if (!amountUSD && !amountARS) return null;
  return { amountARS, amountUSD };
}

// Items like "THB 225,00" or "USD 20,00" appear after the merchant name at x ≈ 200–360.
function extractOriginalCurrency(row: TextItem[]): { currency: string; amount: number } | null {
  const currencyItem = row.find((i) => i.x >= 190 && i.x < 310 && KNOWN_CURRENCIES.has(i.str));
  if (!currencyItem) return null;
  const amountItem = row.find((i) => i.x > currencyItem.x && i.x < 380 && isAmountStr(i.str));
  if (!amountItem) return null;
  const amount = parseAmount(amountItem.str);
  return amount ? { currency: currencyItem.str, amount } : null;
}

// VISA: date format DD.MM.YY at x < 90
function parseVisaExpenses(rows: TextItem[][]): ParsedExpense[] {
  const expenses: ParsedExpense[] = [];

  for (const row of rows) {
    const dateItem = row.find((i) => i.x < 90 && /^\d{2}\.\d{2}\.\d{2}$/.test(i.str));
    if (!dateItem) continue;
    if (row.some((i) => /SU PAGO/i.test(i.str))) continue;

    // Description items: x ≈ [145, 200). Transaction descriptions are always at x≈150.
    // Legal text from the left column appears at x=65-124 or x≥258, so this range is clean.
    const descItems = row.filter(
      (i) =>
        i.x >= 145 &&
        i.x < 200 &&
        !/^\d{2}\.\d{2}\.\d{2}$/.test(i.str) &&
        !KNOWN_CURRENCIES.has(i.str) &&
        !/^\d+[*]?$/.test(i.str)  // skip pure voucher numbers
    );
    if (descItems.length === 0) continue;

    const rawDesc = descItems.map((i) => i.str).join(" ").trim();
    if (!rawDesc || rawDesc.length < 3) continue;
    if (/^(TOTAL|SUBTOTAL|SALDO|FECHA|DESCRIPCION|DETALLE)$/i.test(rawDesc)) continue;

    // Strip trailing embedded currency codes like "in1TMnaUBUSD" won't match,
    // but "MERCHANT NAME THB" (currency as separate word) would:
    const trailingCurrMatch = /\s([A-Z]{3})$/.exec(rawDesc);
    const description =
      trailingCurrMatch && KNOWN_CURRENCIES.has(trailingCurrMatch[1])
        ? rawDesc.slice(0, -4).trim()
        : rawDesc;

    const installMatch = description.match(/C\.(\d+\/\d+)/i);
    const installmentInfo = installMatch ? installMatch[0].toUpperCase() : null;

    const amounts = resolveAmounts(row);
    if (!amounts) continue;

    const orig = extractOriginalCurrency(row);
    const excluded = isTaxLine(description);
    expenses.push({
      description,
      installmentInfo,
      originalCurrency: orig?.currency ?? null,
      originalAmount: orig?.amount ?? null,
      amountARS: amounts.amountARS,
      amountUSD: amounts.amountUSD,
      isExcluded: excluded,
      excludeReason: excluded ? "Impuesto auto-detectado" : null,
    });
  }

  return expenses;
}

// MASTER: date+description at x ≤ 45 in format "DD-Mmm-YY DESCRIPTION"
const MASTER_DATE_RE = /^\d{2}-(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)-\d{2}\s+/i;

function parseMasterExpenses(rows: TextItem[][]): ParsedExpense[] {
  const expenses: ParsedExpense[] = [];

  for (const row of rows) {
    const mainItem = row.find((i) => i.x <= 45 && MASTER_DATE_RE.test(i.str));
    if (!mainItem) continue;

    const dateMatch = MASTER_DATE_RE.exec(mainItem.str);
    if (!dateMatch) continue;

    // Extract description from the item (strip date prefix and parenthetical embedded amounts)
    let description = mainItem.str.slice(dateMatch[0].length).trim();
    description = description.replace(/\(.*$/, "").trim();  // remove "(USA,ARS,..." suffix
    if (!description || description.length < 2) continue;
    if (/^(TOTAL|SUBTOTAL|SALDO|FECHA|PAGO|SU PAGO|CUOTA)$/i.test(description)) continue;
    if (/SU PAGO|PAGO MINIMO/i.test(description)) continue;

    const amounts = resolveAmounts(row);
    if (!amounts) continue;

    const orig = extractOriginalCurrency(row);
    const excluded = isTaxLine(description);
    expenses.push({
      description,
      installmentInfo: null,
      originalCurrency: orig?.currency ?? null,
      originalAmount: orig?.amount ?? null,
      amountARS: amounts.amountARS,
      amountUSD: amounts.amountUSD,
      isExcluded: excluded,
      excludeReason: excluded ? "Impuesto auto-detectado" : null,
    });
  }

  return expenses;
}

function parseExpenses(items: TextItem[]): ParsedExpense[] {
  const rows = groupByRow(items).map(deduplicateItems);

  const hasVisaDates = rows.some((r) =>
    r.some((i) => i.x < 90 && /^\d{2}\.\d{2}\.\d{2}$/.test(i.str))
  );
  const hasMasterDates = rows.some((r) =>
    r.some((i) => i.x <= 45 && MASTER_DATE_RE.test(i.str))
  );

  if (hasVisaDates) return parseVisaExpenses(rows);
  if (hasMasterDates) return parseMasterExpenses(rows);
  return [];
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let items: TextItem[] = [];
  try {
    items = await extractItems(buffer);
  } catch (err) {
    console.error("PDF parse error:", err);
    return Response.json({ error: "Failed to parse PDF", detail: String(err) }, { status: 422 });
  }

  const expenses = parseExpenses(items);
  return Response.json({ expenses });
}
