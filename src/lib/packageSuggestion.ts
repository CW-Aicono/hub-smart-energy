/** Smallest package combination covering a tenant's active modules (pure calculation). */
export interface SuggestPackage { code: string; uvp: number; requires_package: string | null; requires_any_other: boolean; always_active: boolean; modules: string[] }
export interface Suggestion { packages: string[]; individual: string[]; automatic: string[] }

const AUTOMATIC = ["ev_charging", "adhoc_payment"]; // über Ladepunkte gezählt (Paket 4)

export function suggestPackages(active: string[], defs: SuggestPackage[], hasChargePoints = false): Suggestion {
  const basis = new Set(defs.filter(d => d.always_active).flatMap(d => d.modules));
  const need = [...new Set(active)].filter(m => !basis.has(m) && !AUTOMATIC.includes(m) && m !== "dashboard");
  const options = defs.filter(d => !d.always_active && d.code !== "p4_charging");
  let best: { codes: string[]; covered: number; price: number } | null = null;
  for (let mask = 0; mask < 1 << options.length; mask++) {
    const pick = options.filter((_, i) => mask & (1 << i));
    const codes = pick.map(p => p.code);
    const ok = pick.every(p => (!p.requires_package || codes.includes(p.requires_package)) && (!p.requires_any_other || codes.length > 1 || hasChargePoints));
    if (!ok) continue;
    const mods = new Set(pick.flatMap(p => p.modules));
    const covered = need.filter(m => mods.has(m)).length;
    const price = pick.reduce((s, p) => s + p.uvp, 0);
    if (!best || covered > best.covered || (covered === best.covered && (price < best.price || (price === best.price && codes.length < best.codes.length)))) best = { codes, covered, price };
  }
  const mods = new Set(defs.filter(d => best?.codes.includes(d.code)).flatMap(d => d.modules));
  // Paket nur vorschlagen, wenn es mindestens ein aktives Modul abdeckt (oder als Voraussetzung nötig ist)
  return {
    packages: best?.covered ? best.codes : [],
    individual: need.filter(m => !mods.has(m) || !best?.covered),
    automatic: active.filter(m => AUTOMATIC.includes(m)),
  };
}

/** Prerequisite hints for the booking dialog. */
export function enterpriseHint(locations: number, packages: string[]) {
  return locations >= 7 && !packages.includes("p6_enterprise");
}
