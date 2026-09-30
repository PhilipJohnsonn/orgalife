export class CurrencyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "CurrencyError";
    this.code = code;
    this.status = status;
  }
}

/** Normalizes user input and accepts only codes the runtime knows as ISO 4217. */
export function parseCurrencyCode(input: unknown): string {
  const code = typeof input === "string" ? input.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(code) || !Intl.supportedValuesOf("currency").includes(code)) {
    throw new CurrencyError("INVALID_CURRENCY", 400, "Código de moneda ISO 4217 inválido (ej. EUR)");
  }
  return code;
}

/** A currency stays enabled while an active account still holds it. */
export function assertCurrencyRemovable(
  code: string,
  activeAccounts: { name: string; currency: string }[]
) {
  const users = activeAccounts.filter((account) => account.currency.trim() === code);
  if (users.length > 0) {
    throw new CurrencyError(
      "CURRENCY_IN_USE",
      409,
      `No se puede quitar ${code}: la usa ${users.map((account) => account.name).join(", ")}`
    );
  }
}

export type CurrencyOption = { code: string; name: string };

function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Searches ISO 4217 codes by code or Spanish name, skipping ones already enabled. Exact matches rank first, then prefixes. */
export function searchCurrencies(query: string, enabled: string[], limit = 8): CurrencyOption[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const names = new Intl.DisplayNames("es", { type: "currency" });
  const rank = ({ code, name }: CurrencyOption) => {
    const [c, n] = [fold(code), fold(name)];
    if (c === needle || n === needle) return 0;
    if (c.startsWith(needle)) return 1;
    if (n.startsWith(needle)) return 2;
    return n.includes(needle) ? 3 : -1;
  };
  return Intl.supportedValuesOf("currency")
    .filter((code) => !enabled.includes(code))
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .map((option) => ({ option, score: rank(option) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ option }) => option);
}
