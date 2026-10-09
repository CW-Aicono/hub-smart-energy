/** Paket-Preislogik (Basis + 6 Pakete). Reine Rechnung, keine EMS-Funktion. */
export interface PackageDef {
  code: string;
  name: string;
  uvp: number;
  ek: number;
  requires_package: string | null;
  requires_any_other: boolean;
  always_active: boolean;
}
export interface UnitPrice { code: string; uvp: number; ek: number }

export interface QuoteInput {
  packages: string[];
  locations: number;
  chargePoints: number;
  billedSessions: number;
}

export interface QuoteResult { uvp: number; ek: number; lines: { label: string; uvp: number; ek: number }[] }

export const ENTERPRISE = "p6_enterprise";
const r2 = (n: number) => Math.round(n * 100) / 100;

export function checkDependencies(selected: string[], defs: PackageDef[]): string[] {
  const errs: string[] = [];
  const set = new Set(selected);
  for (const code of selected) {
    const d = defs.find((x) => x.code === code);
    if (!d) continue;
    if (d.requires_package && !set.has(d.requires_package)) {
      const req = defs.find((x) => x.code === d.requires_package)?.name ?? d.requires_package;
      errs.push(`„${d.name}“ ist nur zusammen mit „${req}“ buchbar.`);
    }
    if (d.requires_any_other) {
      const others = selected.filter((c) => c !== code && !defs.find((x) => x.code === c)?.always_active);
      if (others.length === 0) errs.push(`„${d.name}“ ist nur zusammen mit mindestens einem anderen Paket buchbar.`);
    }
  }
  return errs;
}

export function calculateQuote(input: QuoteInput, defs: PackageDef[], units: UnitPrice[]): QuoteResult {
  const u = (c: string) => units.find((x) => x.code === c) ?? { code: c, uvp: 0, ek: 0 };
  const lines: QuoteResult["lines"] = [];
  for (const code of input.packages) {
    const d = defs.find((x) => x.code === code);
    if (d && !d.always_active) lines.push({ label: d.name, uvp: d.uvp, ek: d.ek });
  }
  const extraLoc = input.packages.includes(ENTERPRISE) ? 0 : Math.max(0, input.locations - 1);
  if (extraLoc > 0) { const p = u("extra_location"); lines.push({ label: `${extraLoc} weitere Liegenschaft(en)`, uvp: extraLoc * p.uvp, ek: extraLoc * p.ek }); }
  if (input.chargePoints > 0) { const p = u("charge_point"); lines.push({ label: `${input.chargePoints} Ladepunkt(e)`, uvp: input.chargePoints * p.uvp, ek: input.chargePoints * p.ek }); }
  if (input.billedSessions > 0) { const p = u("charging_session"); lines.push({ label: `${input.billedSessions} abgerechnete Ladevorgänge`, uvp: input.billedSessions * p.uvp, ek: input.billedSessions * p.ek }); }
  const out = lines.map((l) => ({ ...l, uvp: r2(l.uvp), ek: r2(l.ek) }));
  return { lines: out, uvp: r2(out.reduce((s, l) => s + l.uvp, 0)), ek: r2(out.reduce((s, l) => s + l.ek, 0)) };
}

/** Endpreis = UVP × (1 − Rabatt) = EK × (1 + Aufschlag) */
export function priceViews(endPrice: number, uvp: number, ek: number) {
  return {
    discountOnUvpPct: uvp > 0 ? r2((1 - endPrice / uvp) * 100) : 0,
    markupOnEkPct: ek > 0 ? r2((endPrice / ek - 1) * 100) : 0,
    belowEk: endPrice < ek,
  };
}
