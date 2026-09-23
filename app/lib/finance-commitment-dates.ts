// Pure date math for "Termina después de N pagos": the date of the Nth
// occurrence counting startsOn as payment 1. No imports beyond globals.

function formatCivilDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCivilDate(civilDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = civilDate.split("-").map(Number);
  return { year, month, day };
}

/**
 * Computes the civil date (YYYY-MM-DD) of the Nth occurrence of a WEEKLY or
 * MONTHLY commitment starting on `startsOn`, where `paymentsCount` is N
 * (startsOn itself is payment 1). MONTHLY clamps to the target month's last
 * day (e.g. Jan 31 + 1 month -> Feb 28/29).
 */
export function computeCommitmentEndsOn(
  frequency: "WEEKLY" | "MONTHLY",
  startsOn: string,
  paymentsCount: number
): string {
  const { year, month, day } = parseCivilDate(startsOn);

  if (frequency === "WEEKLY") {
    const date = new Date(Date.UTC(year, month - 1, day + 7 * (paymentsCount - 1)));
    return formatCivilDate(date);
  }

  const monthsToAdd = paymentsCount - 1;
  const totalMonthIndex = (month - 1) + monthsToAdd;
  const targetYear = year + Math.floor(totalMonthIndex / 12);
  const targetMonth = ((totalMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return formatCivilDate(new Date(Date.UTC(targetYear, targetMonth, clampedDay)));
}
