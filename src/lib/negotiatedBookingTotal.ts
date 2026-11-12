/** Allocate an explicit whole-term price in cents; the final position absorbs rounding. */
export function allocateBookingTotal(total: number, weights: number[]): number[] {
  if (!Number.isFinite(total) || total < 0 || !weights.length || weights.some(w => !Number.isFinite(w) || w < 0)) return [];
  const cents = Math.round(total * 100), sum = weights.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return weights.map((weight, index) => {
    const part = index === weights.length - 1 ? cents - allocated : Math.floor(cents * (sum > 0 ? weight / sum : 1 / weights.length));
    allocated += part;
    return part / 100;
  });
}
export function parseBookingTotal(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN;
}