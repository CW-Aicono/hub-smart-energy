import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, Loader2, Cpu, Trash2, RefreshCw } from "lucide-react";
import { AccessorySuggestions } from "./AccessorySuggestions";
import { ClassBadge } from "./ClassBadge";
import { useInvalidateAccessorySuggestions } from "@/hooks/useAccessorySuggestions";

interface Recommendation {
  id: string;
  device_catalog_id: string;
  begruendung: string | null;
  source: string;
  partner_override: boolean;
  menge: number;
  parent_recommendation_id: string | null;
  geraete_klasse: string | null;
  device_catalog: {
    hersteller: string;
    modell: string;
    vk_preis: number;
    installations_pauschale: number;
    geraete_klasse: string | null;
  } | null;
}

interface Props {
  measurementPointId: string;
}

export function DeviceRecommendation({ measurementPointId }: Props) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const invalidateAccessories = useInvalidateAccessorySuggestions();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("sales_recommended_devices")
      .select(
        "id, device_catalog_id, begruendung, source, partner_override, menge, parent_recommendation_id, geraete_klasse, device_catalog:device_catalog_id(hersteller, modell, vk_preis, installations_pauschale, geraete_klasse)"
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
    invalidateAccessories();
    load();
  };

  const removeRec = async (id: string, isRequired: boolean) => {
    if (isRequired) {
      const ok = window.confirm(
        "Dies ist Pflicht-Zubehör für ein Hauptgerät. Wirklich entfernen? Du kannst es später erneut über die Vorschläge hinzufügen.",
      );
      if (!ok) return;
    }
    const { error } = await supabase
      .from("sales_recommended_devices")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
      return;
    }
    invalidateAccessories();
    load();
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground">Lade Empfehlungen…</div>;
  }

  const mainRecs = recommendations.filter((r) => !r.parent_recommendation_id);
  const childByParent = new Map<string, Recommendation[]>();
  for (const r of recommendations) {
    if (r.parent_recommendation_id) {
      const arr = childByParent.get(r.parent_recommendation_id) ?? [];
      arr.push(r);
      childByParent.set(r.parent_recommendation_id, arr);
    }
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
          variant={mainRecs.length === 0 ? "default" : "ghost"}
          onClick={() => runRecommend(mainRecs.length > 0)}
          disabled={running}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : mainRecs.length === 0 ? (
            <Sparkles className="h-3.5 w-3.5 mr-1" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
          )}
          {mainRecs.length === 0 ? "Empfehlung holen" : "Neu berechnen"}
        </Button>
      </div>

      {mainRecs.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-3 rounded-md border border-dashed">
          Noch keine Empfehlung. Tippe auf "Empfehlung holen" für regelbasierte oder KI-gestützte Auswahl.
        </div>
      ) : (
        mainRecs.map((r) => {
          const children = childByParent.get(r.id) ?? [];
          const klasse = r.device_catalog?.geraete_klasse ?? r.geraete_klasse ?? "meter";
          return (
            <div key={r.id} className="rounded-md border bg-card p-2.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ClassBadge klasse={klasse} />
                    <div className="text-sm font-medium truncate">
                      {r.device_catalog?.hersteller} {r.device_catalog?.modell}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
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
                    onClick={() => removeRec(r.id, false)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
              {r.begruendung && (
                <div className="text-xs text-muted-foreground italic">{r.begruendung}</div>
              )}

              {children.length > 0 && (
                <div className="pl-3 border-l-2 border-primary/30 space-y-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Zubehör
                  </div>
                  {children.map((c) => {
                    const isRequired = c.source === "rule" && !c.partner_override;
                    const cKlasse = c.device_catalog?.geraete_klasse ?? c.geraete_klasse ?? "accessory";
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-xs">
                        <ClassBadge klasse={cKlasse} />
                        <div className="flex-1 min-w-0">
                          <div className="truncate">
                            {c.menge}× {c.device_catalog?.hersteller} {c.device_catalog?.modell}
                          </div>
                        </div>
                        {isRequired && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 border-destructive/40 text-destructive">
                            Pflicht
                          </Badge>
                        )}
                        <span className="tabular-nums text-muted-foreground">
                          {((c.device_catalog?.vk_preis ?? 0) * c.menge).toFixed(2)} €
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => removeRec(c.id, isRequired)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}

      {mainRecs.length > 0 && (
        <AccessorySuggestions measurementPointId={measurementPointId} onAdded={load} />
      )}
    </div>
  );
}
