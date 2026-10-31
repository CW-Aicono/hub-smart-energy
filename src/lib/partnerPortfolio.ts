/** Paket-Portfolio eines Partners: ein Paket gilt als freigeschaltet, wenn alle seine Module im Partner-Portfolio liegen. */
export interface PackageModuleLink { package_code: string; module_code: string }

export function packageModules(code: string, links: PackageModuleLink[]): string[] {
  return links.filter((l) => l.package_code === code).map((l) => l.module_code);
}

export type PortfolioState = "on" | "partial" | "off";

export function packagePortfolioState(code: string, links: PackageModuleLink[], portfolio: string[]): PortfolioState {
  const mods = packageModules(code, links);
  if (mods.length === 0) return "off";
  const have = mods.filter((m) => portfolio.includes(m)).length;
  return have === mods.length ? "on" : have === 0 ? "off" : "partial";
}

export function isPackageUnlocked(code: string, links: PackageModuleLink[], portfolio: string[]): boolean {
  return packagePortfolioState(code, links, portfolio) === "on";
}

/** Module, die beim Ausschalten eines Pakets entzogen werden dürfen (nicht von einem anderen freigeschalteten Paket benötigt). */
export function modulesToRevoke(code: string, links: PackageModuleLink[], portfolio: string[]): string[] {
  const mods = packageModules(code, links);
  const otherPkgs = [...new Set(links.map((l) => l.package_code))].filter((p) => p !== code && isPackageUnlocked(p, links, portfolio));
  const keep = new Set(otherPkgs.flatMap((p) => packageModules(p, links)));
  return mods.filter((m) => portfolio.includes(m) && !keep.has(m));
}
