export function formatMoney(amount: string | number, currency: string) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
}

/** Percent change vs previous; null when there is no previous value to compare. */
export function percentChange(current: string, previous: string) {
  const before = Number(previous);
  if (!before) return null;
  return Math.round(((Number(current) - before) / Math.abs(before)) * 100);
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, index - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dayLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}
