import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, Loader2, Clock, Zap, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useArbitrageAiStrategy, AiStrategySuggestion } from "@/hooks/useArbitrageAiStrategy";
import { useArbitrageStrategies } from "@/hooks/useArbitrageStrategies";
import { useTranslation } from "@/hooks/useTranslation";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

const confidenceColor: Record<string, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  low: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function ArbitrageAiSuggestions() {
  const { result, isGenerating, generate } = useArbitrageAiStrategy();
  const { createStrategy } = useArbitrageStrategies();
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const [adopted, setAdopted] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const adoptStrategy = (suggestion: AiStrategySuggestion, index: number) => {
    if (!suggestion.storage_id) {
      toast({ title: T("common.error"), description: T("aiArb.errorNoStorage"), variant: "destructive" });
      return;
    }
    const allWindows = [...suggestion.charge_windows, ...suggestion.discharge_windows];
    const latestEnd = allWindows.length > 0
      ? allWindows.reduce((max, w) => (w.end > max ? w.end : max), allWindows[0].end)
      : undefined;

    createStrategy.mutate(
      {
        name: suggestion.name,
        storage_id: suggestion.storage_id,
        buy_below_eur_mwh: suggestion.buy_below_eur_mwh,
        sell_above_eur_mwh: suggestion.sell_above_eur_mwh,
        source: "ai",
        valid_until: latestEnd,
      },
      {
        onSuccess: () => {
          setAdopted((prev) => new Set(prev).add(index));
          toast({ title: T("aiArb.adoptedMsg"), description: T("aiArb.adoptedDesc").replace("{name}", suggestion.name) });
        },
      }
    );
  };

  const toggleExpand = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const formatTime = (iso: string) => {
    try {
      return format(new Date(iso), "HH:mm");
    } catch {
      return iso;
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            {T("aiArb.title")}
          </CardTitle>
          <Button onClick={generate} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
            {isGenerating ? T("aiArb.analyzing") : T("aiArb.analyze")}
          </Button>
        </div>
        <CardDescription>
          {T("aiArb.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result && !isGenerating && (
          <div className="text-center py-8 text-muted-foreground space-y-2">
            <Brain className="h-10 w-10 mx-auto opacity-30" />
            <p>{T("aiArb.empty")}</p>
            <p className="text-xs">{T("aiArb.emptyHint")}</p>
          </div>
        )}

        {isGenerating && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{T("aiArb.loadingMsg")}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {result.market_summary && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm font-medium">{T("aiArb.marketSummary")}</p>
                <p className="text-sm text-muted-foreground">{result.market_summary}</p>
              </div>
            )}

            {result.suggestions.length === 0 && (
              <p className="text-center py-6 text-muted-foreground">
                {T("aiArb.noProfitable")}
              </p>
            )}

            {result.suggestions.map((s, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      <Badge className={confidenceColor[s.confidence] || ""} variant="secondary">
                        {T("aiArb.confidence")}: {T(`aiArb.confidence_${s.confidence}`)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        ~{s.estimated_revenue_eur.toFixed(2)} €
                      </span>
                      {adopted.has(i) ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {T("aiArb.adopted")}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => adoptStrategy(s, i)}
                          disabled={!s.storage_id || createStrategy.isPending}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          {T("aiArb.adopt")}
                        </Button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">{s.reasoning}</p>

                  <div className="flex items-center gap-4 text-sm">
                    <span>{T("aiArb.storage")}: <strong>{s.storage_name}</strong></span>
                    <span>{T("aiArb.buyBelow")} <strong>{s.buy_below_eur_mwh} €/MWh</strong></span>
                    <span>{T("aiArb.sellAbove")} <strong>{s.sell_above_eur_mwh} €/MWh</strong></span>
                  </div>

                  <Button variant="ghost" size="sm" onClick={() => toggleExpand(i)} className="w-full mt-1">
                    {expanded.has(i) ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                    {expanded.has(i) ? T("aiArb.hideWindows") : T("aiArb.showWindows")}
                  </Button>
                </div>

                {expanded.has(i) && (
                  <div className="border-t bg-muted/30 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-1">
                        <Zap className="h-3 w-3 text-green-600" />
                        {T("aiArb.charge")}
                      </p>
                      {s.charge_windows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{T("aiArb.noCharge")}</p>
                      ) : (
                        <div className="space-y-1">
                          {s.charge_windows.map((w, j) => (
                            <div key={j} className="text-xs bg-green-50 dark:bg-green-950/30 rounded p-2 flex items-center gap-2">
                              <Clock className="h-3 w-3 flex-shrink-0" />
                              <span className="font-mono">{formatTime(w.start)} – {formatTime(w.end)}</span>
                              <span className="text-muted-foreground">· {w.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-amber-600" />
                        {T("aiArb.discharge")}
                      </p>
                      {s.discharge_windows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{T("aiArb.noDischarge")}</p>
                      ) : (
                        <div className="space-y-1">
                          {s.discharge_windows.map((w, j) => (
                            <div key={j} className="text-xs bg-amber-50 dark:bg-amber-950/30 rounded p-2 flex items-center gap-2">
                              <Clock className="h-3 w-3 flex-shrink-0" />
                              <span className="font-mono">{formatTime(w.start)} – {formatTime(w.end)}</span>
                              <span className="text-muted-foreground">· {w.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {result.generated_at && (
              <p className="text-xs text-muted-foreground text-right">
                {T("aiArb.generated")}: {format(new Date(result.generated_at), "dd.MM.yyyy HH:mm")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}