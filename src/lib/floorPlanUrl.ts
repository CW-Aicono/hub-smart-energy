/**
 * Grundriss-Dateien werden per upsert unter dem gleichen Storage-Pfad überschrieben.
 * Ohne Cache-Buster liefern CDN/Browser-Cache (z.B. auf Hetzner) den alten Plan.
 * Diese Helper stellen sicher, dass jede Public-URL einen ?v=<version> Parameter trägt.
 *
 * `version` sollte stabil pro Datei-Version sein (z.B. `updated_at` des Floor-Records),
 * damit der Browser cachen kann, solange sich der Plan nicht ändert.
 */
export function withFloorPlanCacheBuster(
  url: string | null | undefined,
  version?: string | number | null,
): string | null {
  if (!url) return null;
  // Bereits ein v= Query-Param vorhanden? Dann unverändert lassen.
  if (/[?&]v=/.test(url)) return url;
  const v = version ? String(version).replace(/[^a-zA-Z0-9_-]/g, "") : Date.now().toString();
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${v}`;
}
