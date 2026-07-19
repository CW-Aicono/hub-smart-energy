import { supabase } from "@/integrations/supabase/client";
import { SNIPPET_GROUPS } from "./snippetsCatalog";

/**
 * Befüllt/aktualisiert `loxone_template_registry` aus der im Frontend gepflegten
 * Snippet-Bibliothek. So ist sichergestellt, dass Preview- und Live-Datenbank
 * (Lovable-Cloud bzw. self-hosted Supabase auf Hetzner) den gleichen Katalog
 * kennen — ohne dass jemand SQL laufen lassen muss.
 *
 * Idempotent: verwendet `template_key` + `version` als Upsert-Schlüssel.
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
        changelog: "v1.2.0: Phase 2–4 hinzugefügt — Gruppen H (ArbitrageDispatch, PeakEventPrecharge), I (GridOperatorSignal, CommunityAllocation), J (Co2LoadShift, StorageArbitrageSoc). Push-Kanal loxone_pending_writes.",
        description: s.description,
        parameters: s.parameters as any,
        min_miniserver_fw: "12.0",
        changelog: "v1.1.0: Gruppe G (Erweiterte Steuerung) hinzugefügt — GridCurtailment14a, PeakShavingSoc, DlmFallback",
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
