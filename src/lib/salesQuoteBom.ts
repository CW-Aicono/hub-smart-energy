import { supabase } from "@/integrations/supabase/client";
import { moduleTitle, moduleDescription } from "@/lib/salesModuleLabels";

export type BomFilter = "all" | "hardware" | "licenses";

interface BomRow {
  kategorie: string;
  artikelnummer: string;
  ean: string;
  bezeichnung: string;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis_eur: number;
  positionssumme_eur: number;
  abrechnung: string;
}

/**
 * Baut die Stückliste zu einem Angebot zusammen.
 * Hardware kommt aus den aktuellen Empfehlungen des Projekts (wie im QuoteBuilder),
 * Lizenzen aus sales_quote_modules.
 */
export async function buildQuoteBom(quoteId: string, filter: BomFilter): Promise<BomRow[]> {
  const rows: BomRow[] = [];

  // 1) Angebots-Header + zugehöriges Projekt laden
  const { data: quote, error: qErr } = await supabase
    .from("sales_quotes")
    .select("id, project_id, version")
    .eq("id", quoteId)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) throw new Error("Angebot nicht gefunden");

  // 2) Hardware
  if (filter === "all" || filter === "hardware") {
    const { data: dists } = await supabase
      .from("sales_distributions")
      .select("id")
      .eq("project_id", quote.project_id);
    const distIds = (dists ?? []).map((d) => d.id);

    if (distIds.length > 0) {
      const { data: pts } = await supabase
        .from("sales_measurement_points")
        .select("id")
        .in("distribution_id", distIds);
      const ptIds = (pts ?? []).map((p) => p.id);

      const queries: Array<Promise<{ data: any[] | null }>> = [];
      if (ptIds.length > 0) {
        queries.push(
          supabase
            .from("sales_recommended_devices")
            .select("device_catalog_id, menge, geraete_klasse")
            .in("measurement_point_id", ptIds)
            .eq("ist_alternativ", false) as any,
        );
      }
      queries.push(
        supabase
          .from("sales_recommended_devices")
          .select("device_catalog_id, menge, geraete_klasse")
          .in("distribution_id", distIds)
          .eq("ist_alternativ", false) as any,
      );
      const results = await Promise.all(queries);
      const recs = results.flatMap((r) => r.data ?? []);
      const ids = Array.from(new Set(recs.map((r: any) => r.device_catalog_id)));

      if (ids.length > 0) {
        const { data: cat } = await supabase
          .from("device_catalog")
          .select("id, hersteller, modell, artikelnummer, ean, vk_preis, installations_pauschale, einheit, geraete_klasse")
          .in("id", ids);
        const catMap = new Map((cat ?? []).map((c: any) => [c.id, c]));

        for (const r of recs as any[]) {
          const c: any = catMap.get(r.device_catalog_id);
          if (!c) continue;
          const einzel = Number(c.vk_preis) + Number(c.installations_pauschale);
          rows.push({
            kategorie: `Hardware / ${c.geraete_klasse ?? r.geraete_klasse ?? "misc"}`,
            artikelnummer: c.artikelnummer ?? "",
            ean: c.ean ?? "",
            bezeichnung: `${c.hersteller} ${c.modell}`,
            beschreibung: "",
            menge: Number(r.menge),
            einheit: c.einheit ?? "Stück",
            einzelpreis_eur: einzel,
            positionssumme_eur: einzel * Number(r.menge),
            abrechnung: "einmalig",
          });
        }
      }
    }
  }

  // 3) Lizenzen / Module
  if (filter === "all" || filter === "licenses") {
    const { data: mods } = await supabase
      .from("sales_quote_modules")
      .select("module_code, preis_monatlich")
      .eq("quote_id", quoteId);
    for (const m of mods ?? []) {
      const code = (m as any).module_code as string;
      const preis = Number((m as any).preis_monatlich);
      rows.push({
        kategorie: "AICONO-Lizenz",
        artikelnummer: "",
        ean: "",
        bezeichnung: moduleTitle(code),
        beschreibung: moduleDescription(code) || code,
        menge: 1,
        einheit: "Modul",
        einzelpreis_eur: preis,
        positionssumme_eur: preis,
        abrechnung: "monatlich",
      });
    }
  }

  return rows;
}

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Erzeugt eine CSV mit Semikolon-Trennzeichen (Excel DE-freundlich). */
export function bomToCsv(rows: BomRow[]): string {
  const header = [
    "Kategorie",
    "Bezeichnung",
    "Beschreibung",
    "Menge",
    "Einheit",
    "Einzelpreis (EUR)",
    "Positionssumme (EUR)",
    "Abrechnung",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.kategorie,
        r.bezeichnung,
        r.beschreibung,
        r.menge.toLocaleString("de-DE"),
        r.einheit,
        r.einzelpreis_eur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        r.positionssumme_eur.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        r.abrechnung,
      ]
        .map(escapeCsv)
        .join(";"),
    );
  }
  return "\uFEFF" + lines.join("\r\n"); // BOM für Excel
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
