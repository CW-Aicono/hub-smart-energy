import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, AlertCircle, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import {
  useAccessorySuggestions,
  useInvalidateAccessorySuggestions,
  type AccessorySuggestion,
} from "@/hooks/useAccessorySuggestions";
import { ClassBadge } from "./ClassBadge";

interface Props {
  measurementPointId: string;
  onAdded: () => void;
}

export function AccessorySuggestions({ measurementPointId, onAdded }: Props) {
  const { data, isLoading } = useAccessorySuggestions({ measurementPointId });
  const invalidate = useInvalidateAccessorySuggestions();
  const [adding, setAdding] = useState<string | null>(null);

  const addItem = async (item: AccessorySuggestion, kind: "required" | "recommended") => {
    setAdding(item.device_catalog_id);
    const { error } = await supabase.from("sales_recommended_devices").insert({
      measurement_point_id: measurementPointId,
      device_catalog_id: item.device_catalog_id,
      menge: item.menge,
      ist_alternativ: false,
      partner_override: kind === "recommended",
      source: "rule",
      begruendung:
        kind === "required"
          ? `Pflicht-Zubehör für ${item.source_device_name}`
          : `Empfohlen zu ${item.source_device_name}${item.notiz ? " – " + item.notiz : ""}`,
      parent_recommendation_id: item.source_recommendation_id,
      geraete_klasse: item.geraete_klasse,
    });
    setAdding(null);
    if (error) {
      toast.error("Konnte nicht hinzugefügt werden", { description: error.message });
      return;
    }
    toast.success(`${item.hersteller} ${item.modell} hinzugefügt`);
    invalidate();
    onAdded();
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Suche Zubehör…
      </div>
    );
  }

  if (!data || (data.required.length === 0 && data.recommended.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-3">
      {data.required.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            Pflicht-Zubehör
          </div>
          {data.required.map((item) => (
            <div
              key={item.device_catalog_id}
              className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2"
            >
              <ClassBadge klasse={item.geraete_klasse} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {item.hersteller} {item.modell}
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.menge}× · {(item.vk_preis * item.menge).toFixed(2)} €
                  {item.notiz ? ` · ${item.notiz}` : ""}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => addItem(item, "required")}
                disabled={adding === item.device_catalog_id}
              >
                {adding === item.device_catalog_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Übernehmen
              </Button>
            </div>
          ))}
        </div>
      )}

      {data.recommended.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
            <ShoppingBag className="h-3.5 w-3.5" />
            Andere Kunden wählten auch
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {data.recommended.map((item) => (
              <div
                key={item.device_catalog_id}
                className="snap-start shrink-0 w-44 rounded-md border bg-card p-2 space-y-1.5"
              >
                <div className="flex items-center gap-1">
                  <ClassBadge klasse={item.geraete_klasse} />
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {item.menge}×
                  </Badge>
                </div>
                <div className="text-xs font-medium line-clamp-2 min-h-[2rem]">
                  {item.hersteller} {item.modell}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(item.vk_preis * item.menge).toFixed(2)} €
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7"
                  onClick={() => addItem(item, "recommended")}
                  disabled={adding === item.device_catalog_id}
                >
                  {adding === item.device_catalog_id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3 mr-1" />
                  )}
                  Hinzufügen
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
