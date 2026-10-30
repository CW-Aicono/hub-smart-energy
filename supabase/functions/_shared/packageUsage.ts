// Paketabrechnung je Mandant und Monat – reine Rechnung (keine DB, keine EMS-Funktion).
// Wird von der Monatsübersicht und von generate-monthly-invoices gemeinsam genutzt.

export const SUPPORT_REVIEW_MIN = 240; // > 4 h nicht automatisch abrechnen
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PkgDef { code: string; name: string; uvp: number; ek: number; always_active: boolean; modules: string[] }
export interface Span { code: string; start: string; end: string | null; viaContract: boolean } // Datum YYYY-MM-DD, end inkl.
export interface SupportSession { id: string; started_at: string; ended_at: string | null; duration_minutes: number | null; reason?: string | null }
export interface Discount { type: "percent" | "fixed"; value: number; modules: string[] | null; label?: string }
export interface UsageInput {
  month: string; // YYYY-MM
  partner: boolean;
  tenantCreatedAt: string | null;
  packages: Span[];
  defs: PkgDef[];
  units: Record<string, { uvp: number; ek: number }>;
  locations: number;
  chargePoints: number;
  billedSessions: number;
  remoteSupport: Span[]; // Flatrate-Verträge
  supportSessions: SupportSession[];
  supportPrice15?: { uvp: number; ek: number };
  setupViaContract: boolean;
  discounts: Discount[];
}
export interface UsageLine { code: string; type: string; label: string; quantity: number; uvp: number; ek: number; viaContract?: boolean; review?: boolean; session_id?: string }
export interface UsageResult { lines: UsageLine[]; uvp: number; ek: number; billableUvp: number; billableEk: number; quantities: { locations: number; chargePoints: number; billedSessions: number }; review: boolean }

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${month}-${String(days).padStart(2, "0")}`, days };
}
const dayNum = (d: string) => Number(d.slice(8, 10));

/** Anteil (0..1) eines Zeitraums im Monat, tagesgenau inkl. Start- und Endtag. */
export function spanShare(span: { start: string; end: string | null }, month: string) {
  const b = monthBounds(month);
  const s = span.start > b.start ? span.start : b.start;
  const e = span.end && span.end < b.end ? span.end : b.end;
  if (s > b.end || e < b.start || e < s) return 0;
  return (dayNum(e) - dayNum(s) + 1) / b.days;
}

/** Abrechenbare Minuten einer Support-Sitzung; offene Sitzungen gelten nach 4 h als geschlossen und werden geprüft. */
export function supportMinutes(s: SupportSession): { minutes: number; review: boolean } {
  if (!s.ended_at && !s.duration_minutes) return { minutes: SUPPORT_REVIEW_MIN, review: true };
  const minutes = s.duration_minutes ?? Math.max(1, Math.round((new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60000));
  return { minutes, review: minutes > SUPPORT_REVIEW_MIN };
}

export function computeTenantMonth(i: UsageInput): UsageResult {
  const lines: UsageLine[] = [];
  const u = (c: string) => i.units[c] ?? { uvp: 0, ek: 0 };
  const b = monthBounds(i.month);
  const activeCodes = new Set<string>();
  for (const sp of i.packages) {
    const d = i.defs.find((x) => x.code === sp.code);
    if (!d || d.always_active) continue;
    const share = spanShare(sp, i.month);
    if (share <= 0) continue;
    activeCodes.add(sp.code);
    const partial = share < 1;
    lines.push({ code: d.code, type: "package", label: partial ? `${d.name} (anteilig ${Math.round(share * b.days)}/${b.days} Tage)` : d.name, quantity: 1, uvp: r2(d.uvp * share), ek: r2(d.ek * share), viaContract: sp.viaContract });
  }
  const extra = activeCodes.has("p6_enterprise") ? 0 : Math.max(0, i.locations - 1);
  if (extra > 0) lines.push({ code: "extra_location", type: "package_unit", label: `${extra} weitere Liegenschaft(en)`, quantity: extra, uvp: r2(extra * u("extra_location").uvp), ek: r2(extra * u("extra_location").ek) });
  if (i.chargePoints > 0) lines.push({ code: "charge_point", type: "package_unit", label: `${i.chargePoints} aktive Ladepunkte`, quantity: i.chargePoints, uvp: r2(i.chargePoints * u("charge_point").uvp), ek: r2(i.chargePoints * u("charge_point").ek) });
  if (i.billedSessions > 0) lines.push({ code: "charging_session", type: "package_unit", label: `${i.billedSessions} abgerechnete Ladevorgänge`, quantity: i.billedSessions, uvp: r2(i.billedSessions * u("charging_session").uvp), ek: r2(i.billedSessions * u("charging_session").ek) });
  let flat = false;
  for (const sp of i.remoteSupport) {
    const share = spanShare(sp, i.month);
    if (share <= 0) continue;
    flat = true;
    lines.push({ code: "remote_support", type: "package_unit", label: "Remote-Support-Flatrate", quantity: 1, uvp: r2(u("remote_support").uvp * share), ek: r2(u("remote_support").ek * share), viaContract: sp.viaContract });
  }
  const sp15 = i.supportPrice15 ?? u("support_15min");
  for (const s of i.supportSessions) {
    const { minutes, review } = supportMinutes(s);
    const blocks = Math.ceil(minutes / 15);
    const date = new Date(s.started_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    const label = `${date} – Support ${minutes.toLocaleString("de-DE")} Min.${review ? " (Prüfen)" : ""}${flat ? " (Flatrate)" : ""}`;
    lines.push({ code: "support_15min", type: "support", label, quantity: blocks, uvp: flat ? 0 : r2(blocks * sp15.uvp), ek: flat ? 0 : r2(blocks * sp15.ek), review, session_id: s.id });
  }
  if (!i.setupViaContract && i.tenantCreatedAt && i.tenantCreatedAt.slice(0, 7) === i.month) {
    lines.push({ code: "setup", type: "one_time", label: "Einrichtung (einmalig)", quantity: 1, uvp: u("setup").uvp, ek: u("setup").ek });
  }
  // Freigegebene Partnerrabatte wirken auf den EK der betroffenen Pakete
  if (i.partner) {
    for (const d of i.discounts) {
      const base = lines.filter((l) => l.type === "package" && !l.viaContract && (!d.modules?.length || (i.defs.find((x) => x.code === l.code)?.modules ?? []).some((m) => d.modules!.includes(m)))).reduce((s, l) => s + l.ek, 0);
      if (base <= 0) continue;
      const amt = r2(Math.min(base, d.type === "percent" ? base * d.value / 100 : d.value));
      if (amt > 0) lines.push({ code: "discount", type: "discount", label: d.label ?? (d.type === "percent" ? `Partnerrabatt ${d.value.toLocaleString("de-DE")} %` : "Partnerrabatt"), quantity: 1, uvp: 0, ek: -amt });
    }
  }
  const sum = (k: "uvp" | "ek", f: (l: UsageLine) => boolean) => r2(lines.filter(f).reduce((s, l) => s + l[k], 0));
  const billable = (l: UsageLine) => !l.viaContract && !l.review;
  return {
    lines,
    uvp: sum("uvp", (l) => !l.review), ek: sum("ek", (l) => !l.review),
    billableUvp: sum("uvp", billable), billableEk: sum("ek", billable),
    quantities: { locations: i.locations, chargePoints: i.chargePoints, billedSessions: i.billedSessions },
    review: lines.some((l) => l.review),
  };
}

export interface Delta { text: string; uvp: number; ek: number; plausibility: boolean }
/** „Änderung zum Vormonat“ und Plausibilität (> 50 % Mengenänderung = gelb). */
export function monthDelta(cur: UsageResult, prev: UsageResult | null): Delta {
  if (!prev) return { text: "", uvp: 0, ek: 0, plausibility: false };
  const names: Record<string, string> = { locations: "Liegenschaften", chargePoints: "Ladepunkte", billedSessions: "Ladevorgänge" };
  const parts: string[] = [];
  let flag = false;
  for (const k of Object.keys(names) as (keyof UsageResult["quantities"])[]) {
    const a = prev.quantities[k], c = cur.quantities[k];
    if (a === c) continue;
    parts.push(`${names[k]} ${a.toLocaleString("de-DE")} → ${c.toLocaleString("de-DE")}`);
    if (a === 0 ? c > 0 : Math.abs(c - a) / a > 0.5) flag = true;
  }
  const uvp = r2(cur.uvp - prev.uvp), ek = r2(cur.ek - prev.ek);
  return { text: parts.join(", "), uvp, ek, plausibility: flag };
}

/** Nachberechnung: nachträglich höhere Mengen eines bereits abgerechneten Monats. */
export function backCharge(recomputed: UsageResult, billedQty: Record<string, number>, units: Record<string, { uvp: number; ek: number }>, month: string): UsageLine[] {
  const out: UsageLine[] = [];
  const map: [string, keyof UsageResult["quantities"], string][] = [["charge_point", "chargePoints", "Ladepunkte"], ["charging_session", "billedSessions", "Ladevorgänge"]];
  for (const [code, key, name] of map) {
    const diff = recomputed.quantities[key] - (billedQty[code] ?? 0);
    if (diff <= 0) continue;
    const p = units[code] ?? { uvp: 0, ek: 0 };
    out.push({ code, type: "back_charge", label: `Nachberechnung ${month}: ${diff} ${name}`, quantity: diff, uvp: r2(diff * p.uvp), ek: r2(diff * p.ek) });
  }
  return out;
}
