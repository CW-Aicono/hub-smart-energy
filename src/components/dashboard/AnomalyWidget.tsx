import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useLocations } from "@/hooks/useLocations";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { BrainCircuit, AlertTriangle, ShieldAlert, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface AnomalyWidgetProps {
  locationId: string | null;
}

interface Anomaly {
  severity: "warning" | "critical" | "info";
  title: string;
  description: string;
  month: string;
  energyType: string;
  recommendation: string;
}

interface AnalysisResult {
  anomalies: Anomaly[];
  summary: string;
  overallRisk: "low" | "medium" | "high";
}

const SEVERITY_CONFIG = {
  critical: { icon: ShieldAlert, color: "text-destructive", badge: "destructive" as const, label: "Kritisch" },
  warning: { icon: AlertTriangle, color: "text-amber-500", badge: "secondary" as const, label: "Warnung" },
  info: { icon: Info, color: "text-blue-500", badge: "outline" as const, label: "Info" },
};

const RISK_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: "Gering", color: "text-emerald-600" },
  medium: { label: "Mittel", color: "text-amber-500" },
  high: { label: "Hoch", color: "text-destructive" },
};

const AnomalyWidget = ({ locationId }: AnomalyWidgetProps) => {
  const { locations } = useLocations();
  const { t } = useTranslation();
  const { monthlyData, hasData } = useEnergyData(locationId);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("anomaly-detection", {
        body: {
          energyData: monthlyData,
          locationName: selectedLocation?.name || null,
        },
      });

      if (fnError) throw fnError;

      if (data?.error) {
        setError(data.error);
        toast.error(data.error);
      } else {
        setResult(data as AnalysisResult);
      }
    } catch (e: any) {
      const msg = e?.message || "Analyse fehlgeschlagen";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            KI-Anomalie-Erkennung
            <HelpTooltip text={t("tooltip.anomaly" as any)} />
          </CardTitle>
          <Button size="sm" variant="outline" onClick={runAnalysis} disabled={loading || !hasData}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            {result ? "Erneut analysieren" : "Analyse starten"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {selectedLocation ? `Analyse für: ${selectedLocation.name}` : "Alle Liegenschaften"}
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-4">{error}</div>
        ) : !result ? (
          <div className="text-center py-8 text-muted-foreground">
            <BrainCircuit className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {hasData
                ? 'Klicken Sie auf "Analyse starten", um die Verbrauchsdaten mit KI auszuwerten.'
                : "Noch keine Verbrauchsdaten für eine Analyse vorhanden."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">Gesamtrisiko:</span>
                <span className={`text-sm font-bold ${RISK_LABELS[result.overallRisk]?.color}`}>
                  {RISK_LABELS[result.overallRisk]?.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </div>
            {result.anomalies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Keine Anomalien erkannt.</p>
            ) : (
              <div className="space-y-3">
                {result.anomalies.map((anomaly, i) => {
                  const config = SEVERITY_CONFIG[anomaly.severity] || SEVERITY_CONFIG.info;
                  const Icon = config.icon;
                  return (
                    <div key={i} className="rounded-md border p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${config.color}`} />
                        <span className="text-sm font-medium">{anomaly.title}</span>
                        <Badge variant={config.badge} className="text-xs ml-auto">{anomaly.month}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                      <p className="text-xs text-primary">💡 {anomaly.recommendation}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AnomalyWidget;
