import { supabase } from "@/integrations/supabase/client";
import { SNIPPET_GROUPS, CLOUD_REQUIRED_TEMPLATE_KEYS } from "./snippetsCatalog";

/**
 * Befüllt/aktualisiert `loxone_template_registry` aus der im Frontend
 * gepflegten Snippet-Bibliothek. Idempotent via (template_key, version).
 */
const CURRENT_VERSION = "1.2.1";

export async function seedRegistryFromSnippets(): Promise<{
  inserted: number;
  total: number;
  deactivated: number;
}> {
  const rows: any[] = [];
  const keys: string[] = [];
  for (const group of SNIPPET_GROUPS) {
    const primaryCategory = group.categories[0] ?? "generic";
    for (const s of group.snippets) {
      keys.push(s.templateKey);
      rows.push({
        template_key: s.templateKey,
        version: CURRENT_VERSION,
        category: primaryCategory,
        title: s.title,
        description: s.description,
        parameters: s.parameters as any,
        min_miniserver_fw: "12.0",
        requires_cloud: CLOUD_REQUIRED_TEMPLATE_KEYS.has(s.templateKey),
        changelog:
          "v1.2.1: Kennzeichen requires_cloud für Bausteine ohne Offline-Fähigkeit (Gruppen H/I/J: Arbitrage, Peak-Event, DSO, Community, CO₂, Storage-Trading).",
        is_active: true,
      });
    }
  }


  // 1) aktuelle Version einspielen/aktualisieren
  const { error, count } = await supabase
    .from("loxone_template_registry")
    .upsert(rows, { onConflict: "template_key,version", count: "exact" });
  if (error) throw error;

  // 2) alte Versionen derselben Keys deaktivieren (nicht löschen — Installationen behalten Historie)
  const { data: deactivated, error: deactErr } = await supabase
    .from("loxone_template_registry")
    .update({ is_active: false })
    .in("template_key", keys)
    .neq("version", CURRENT_VERSION)
    .eq("is_active", true)
    .select("id");
  if (deactErr) throw deactErr;

  // 3) Keys, die nicht mehr im Snippet-Katalog existieren, ebenfalls deaktivieren
  const { data: staleActive, error: staleErr } = await supabase
    .from("loxone_template_registry")
    .select("id, template_key")
    .eq("is_active", true);
  if (staleErr) throw staleErr;
  const keySet = new Set(keys);
  const staleIds = (staleActive ?? [])
    .filter((r: any) => !keySet.has(r.template_key))
    .map((r: any) => r.id);
  if (staleIds.length > 0) {
    await supabase
      .from("loxone_template_registry")
      .update({ is_active: false })
      .in("id", staleIds);
  }

  return {
    inserted: count ?? rows.length,
    total: rows.length,
    deactivated: (deactivated?.length ?? 0) + staleIds.length,
  };
}
