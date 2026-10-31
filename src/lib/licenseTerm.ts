/** Letzter Vertragstag: Start + Monate − 1 Tag (YYYY-MM-DD), wie license_term_end in der Datenbank. */
export function termEnd(start: string, months: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const days = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, days));
  target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
}

export function termLabel(months: number | null, autoRenew: boolean | null, start: string, T: (k: string) => string): string {
  if (!months) return T("unlimited");
  const end = new Date(termEnd(start, months) + "T00:00:00").toLocaleDateString("de-DE");
  return `${months.toLocaleString("de-DE")} ${T("months")} · ${autoRenew === false ? T("endsOn") : T("minTermUntil")} ${end}`;
}
