import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ClipboardList } from "lucide-react";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { FederalStateReportProfile } from "@/lib/report/federalStateProfiles";
import type { PriorityRow } from "./SavingsPotentialSection";

interface RecommendationsSectionProps {
  profile: FederalStateReportProfile;
  tenantName?: string;
  reportYear: number;
  rows: PriorityRow[];
}

export function RecommendationsSection({
  profile,
  tenantName,
  reportYear,
  rows,
}: RecommendationsSectionProps) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (rows.length === 0) {
      toast.error("Keine priorisierten Liegenschaften vorhanden.");
      return;
    }
    setLoading(true);
    try {
      const top = rows.slice(0, 10);
      const { data, error } = await supabase.functions.invoke("generate-report-text", {
        body: {
          section: "massnahmen",
          profile: {
            code: profile.code,
            name: profile.name,
            legalBasis: profile.legalBasis,
            reportingCycle: profile.reportingCycle,
            extraTopics: profile.extraTopics,
          },
          context: {
            tenantName,
            reportYear,
            locations: top.map((r) => ({
              name: r.locationName,
              usageType: r.usageType,
              area: Math.round(r.area),
              heatingType: r.energyType,
              benchmarkDeviation: Math.round(((r.specific - r.benchmarkAvg) / r.benchmarkAvg) * 100),
            })),
          },
        },
      });
      if (error) throw error;
      const out = (data as any)?.html;
      if (!out) {
        toast.error((data as any)?.error || "Keine Antwort erhalten.");
        return;
      }
      setHtml(out);
      toast.success("Maßnahmenempfehlungen generiert");
    } catch (e: any) {
      toast.error(e?.message || "KI-Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-report-section="massnahmen">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" /> Maßnahmenempfehlungen
            </CardTitle>
            <CardDescription>
              KI-generierte Vorschläge je Liegenschaft auf Basis der Priorisierung.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={generate} className="gap-2">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {html ? "Neu generieren" : "Generieren"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {html ? (
          <>
            <div
              className="prose prose-sm max-w-none"
              data-report-recommendations-html
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <AiDisclaimer text="Maßnahmenempfehlungen sind KI-generiert und ersetzen keine fachliche Sanierungsplanung." />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Noch keine Empfehlungen erstellt. Klicken Sie auf „Generieren".
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Hilfsfunktion zum Auslesen der gerenderten HTML-Empfehlungen für den Druck */
export function readRecommendationsHtml(): string | null {
  const el = document.querySelector("[data-report-recommendations-html]");
  return el ? el.innerHTML : null;
}
