/** Neutralizes spreadsheet formulas in user-controlled text cells (CSV/XLSX injection). Numbers and plain numeric strings stay untouched. */
export function safeCell<T>(v: T): T | string {
  if (typeof v !== "string") return v;
  if (/^-?[\d.,\s]+$/.test(v)) return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Applies safeCell to every cell of an array-of-arrays sheet. */
export function safeRows<R extends unknown[]>(rows: R[]): R[] {
  return rows.map((r) => r.map((c) => safeCell(c)) as R);
}
