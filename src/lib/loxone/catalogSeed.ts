import { supabase } from "@/integrations/supabase/client";
import { SNIPPET_GROUPS } from "./snippetsCatalog";

/**
 * Befüllt/aktualisiert `loxone_template_registry` aus der im Frontend
 * gepflegten Snippet-Bibliothek. Idempotent via (template_key, version).
 */
export async function seedRegistryFromSnippets(): Promise<{ inserted: number; total: number }> {
  const rows: any[] = [];
  for (const group of SNIPPET_GROUPS) {
    const primaryCategory = group.categories[0] ?? "generic";
    for (const s of group.snippets) {
      rows.push({
        template_key: s.templateKey,
        version: "1.2.0",
        category: primaryCategory,
        title: s.title,
        description: s.description,
        parameters: s.parameters as any,
        min_miniserver_fw: "12.0",
        changelog:
          "v1.2.0: Phase 2–4 hinzugefügt — Gruppen H (ArbitrageDispatch, PeakEventPrecharge), I (GridOperatorSignal, CommunityAllocation), J (Co2LoadShift, StorageArbitrageSoc). Push-Kanal loxone_pending_writes.",
        is_active: true,
      });
    }
  }

  const { error, count } = await supabase
    .from("loxone_template_registry")
    .upsert(rows, { onConflict: "template_key,version", count: "exact" });

  if (error) throw error;
  return { inserted: count ?? rows.length, total: rows.length };
}
