import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, Loader2 } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useArbitrageAiStrategy } from "@/hooks/useArbitrageAiStrategy";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigate } from "react-router-dom";

interface ArbitrageAiWidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const confidenceColor: Record<string, string> = {
  hoch: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  mittel: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  niedrig: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function ArbitrageAiWidget({ locationId }: ArbitrageAiWidgetProps) {
  const { result, isGenerating, generate } = useArbitrageAiStrategy();
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            KI-Handelsempfehlung
            <HelpTooltip text={t("tooltip.arbitrageAi" as any)} />
          </CardTitle>
          <Button size="sm" variant="outline" onClick={generate} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            {isGenerating ? "Analysiert…" : "Analyse starten"}
          </Button>
        </div>
        {result?.market_summary && (
          <CardDescription className="mt-1">{result.market_summary}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {!result && !isGenerating && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Klicken Sie auf „Analyse starten", um KI-basierte Strategievorschläge zu erhalten.
          </p>
        )}
        {isGenerating && (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Spotpreise & PV-Prognosen werden analysiert…</span>
          </div>
        )}
        {result && result.suggestions.length > 0 && (
          <div className="space-y-3">
            {result.suggestions.slice(0, 3).map((s, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge className={confidenceColor[s.confidence] || ""} variant="secondary">
                      {s.confidence}
                    </Badge>
                    <span className="text-sm font-semibold text-green-600 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      ~{s.estimated_revenue_eur.toFixed(2)} €
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{s.reasoning}</p>
                <p className="text-xs">
                  Kauf &lt;{s.buy_below_eur_mwh} €/MWh · Verkauf &gt;{s.sell_above_eur_mwh} €/MWh
                </p>
              </div>
            ))}
            <Button
              variant="link"
              size="sm"
              className="w-full"
              onClick={() => navigate("/arbitrage")}
            >
              Alle Details & Übernahme →
            </Button>
          </div>
        )}
        {result && result.suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aktuell keine profitablen Strategien identifiziert.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
