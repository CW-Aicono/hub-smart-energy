/**
 * Parse a user-entered number that may use German ("," decimal) or English (".") formatting.
 * Returns NaN if the input is empty or not a number.
 */
export function parseDeNumber(input: string | number | null | undefined): number {
  if (input === null || input === undefined) return NaN;
  const s = String(input).trim();
  if (!s) return NaN;
  // Remove thousand separators (dots) if a comma exists, otherwise leave as-is
  const hasComma = s.includes(",");
  const cleaned = hasComma ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** Format a number as German localized string with exactly 2 decimals. */
export function formatEur2(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : parseDeNumber(value as string);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Round to 2 decimals for storage. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
