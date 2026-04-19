import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Loader2, Cpu, Trash2, RefreshCw } from "lucide-react";

interface Recommendation {
  id: string;
  device_catalog_id: string;
  begruendung: string | null;
  source: string;
  partner_override: boolean;
  menge: number;
  device_catalog: {
    hersteller: string;
    modell: string;
    vk_preis: number;
    installations_pauschale: number;
  } | null;
}

interface Props {
  measurementPointId: string;
}

export function DeviceRecommendation({ measurementPointId }: Props) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("sales_recommended_devices")
      .select(
        "id, device_catalog_id, begruendung, source, partner_override, menge, device_catalog:device_catalog_id(hersteller, modell, vk_preis, installations_pauschale)"
      )
      .eq("measurement_point_id", measurementPointId)
      .order("created_at", { ascending: true });
    setRecommendations((data ?? []) as unknown as Recommendation[]);
    setLoading(false);
  }, [measurementPointId]);

  useEffect(() => {
    load();
  }, [load]);

  const runRecommend = async (replace = false) => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("sales-recommend-devices", {
      body: { measurement_point_id: measurementPointId, replace },
    });
    setRunning(false);
    if (error) {
      toast.error("Empfehlung fehlgeschlagen", { description: error.message });
      return;
    }
    if ((data as { error?: string })?.error) {
      toast.error("Empfehlung fehlgeschlagen", { description: (data as { error: string }).error });
      return;
    }
    toast.success("Geräte-Empfehlung erstellt");
    load();
  };

  const removeRec = async (id: string) => {
    const { error } = await supabase
      .from("sales_recommended_devices")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
      return;
    }
    load();
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground">Lade Empfehlungen…</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-1">
          <Cpu className="h-3.5 w-3.5" />
          Geräte-Empfehlung
        </div>
        <Button
          size="sm"
          variant={recommendations.length === 0 ? "default" : "ghost"}
          onClick={() => runRecommend(recommendations.length > 0)}
          disabled={running}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : recommendations.length === 0 ? (
            <Sparkles className="h-3.5 w-3.5 mr-1" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
          )}
          {recommendations.length === 0 ? "Empfehlung holen" : "Neu berechnen"}
        </Button>
      </div>

      {recommendations.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-3 rounded-md border border-dashed">
          Noch keine Empfehlung. Tippe auf "Empfehlung holen" für regelbasierte oder KI-gestützte Auswahl.
        </div>
      ) : (
        recommendations.map((r) => (
          <div key={r.id} className="rounded-md border bg-card p-2.5 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {r.device_catalog?.hersteller} {r.device_catalog?.modell}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.device_catalog
                    ? `${r.device_catalog.vk_preis.toFixed(2)} € + ${r.device_catalog.installations_pauschale.toFixed(2)} € Inst.`
                    : "—"}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge
                  variant={r.source === "rule" ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {r.source === "rule" ? "Regel" : r.source === "ai" ? "KI" : "Manuell"}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => removeRec(r.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
            {r.begruendung && (
              <div className="text-xs text-muted-foreground italic">{r.begruendung}</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
