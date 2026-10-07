import { format } from "date-fns";

/** Excel-taugliches CSV: UTF-8-BOM, Semikolon, deutsche Zahlen. */
const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const csvNum = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || isNaN(Number(n))
    ? ""
    : Number(n).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });

export const csvDate = (d: string | null | undefined, withTime = false) =>
  d ? format(new Date(d), withTime ? "dd.MM.yyyy HH:mm" : "dd.MM.yyyy") : "";

export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const body = [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
