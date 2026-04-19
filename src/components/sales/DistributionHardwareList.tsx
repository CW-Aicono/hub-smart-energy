import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Cpu } from "lucide-react";
import { toast } from "sonner";
import { ClassBadge, CLASS_LABELS } from "./ClassBadge";
import { AddHardwareDialog } from "./AddHardwareDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  distributionId: string;
  hideAddButton?: boolean;
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
}

interface HardwareRow {
  id: string;
  menge: number;
  parent_recommendation_id: string | null;
  geraete_klasse: string | null;
  device: {
    id: string;
    hersteller: string;
    modell: string;
    vk_preis: number;
    einheit: string;
    geraete_klasse: string;
  } | null;
}

export function DistributionHardwareList({ distributionId }: Props) {
  const [items, setItems] = useState<HardwareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_recommended_devices")
      .select(`
        id, menge, parent_recommendation_id, geraete_klasse,
        device:device_catalog_id (id, hersteller, modell, vk_preis, einheit, geraete_klasse)
      `)
      .eq("distribution_id", distributionId)
      .eq("scope", "distribution")
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Hardware laden fehlgeschlagen", { description: error.message });
    } else {
      setItems((data ?? []) as unknown as HardwareRow[]);
    }
    setLoading(false);
  }, [distributionId]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    const { error } = await supabase
      .from("sales_recommended_devices")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
      return;
    }
    toast.success("Entfernt");
    load();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5" />
          Schaltschrank-Hardware
          {items.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1">{items.length}</Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Hardware
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Lädt…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          Keine Hardware. Füge Gateways, Switches, Netzteile usw. hinzu.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => {
            if (!it.device) return null;
            const isChild = !!it.parent_recommendation_id;
            const klasse = it.device.geraete_klasse ?? it.geraete_klasse ?? "misc";
            const summe = Number(it.device.vk_preis) * it.menge;
            return (
              <div
                key={it.id}
                className={`flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 ${
                  isChild ? "ml-4 border-dashed" : ""
                }`}
              >
                <ClassBadge klasse={klasse} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {isChild && <span className="text-muted-foreground mr-1">↳</span>}
                    {it.device.hersteller} {it.device.modell}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.menge} {it.device.einheit ?? "Stück"} ·{" "}
                    {Number(it.device.vk_preis).toFixed(2)} € · ∑ {summe.toFixed(2)} €
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Hardware entfernen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {it.device.hersteller} {it.device.modell} wird aus der Verteilung entfernt.
                        {!isChild && " Verknüpftes Pflicht-Zubehör bleibt erhalten und sollte ggf. manuell entfernt werden."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(it.id)}>Entfernen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            );
          })}
        </div>
      )}

      <AddHardwareDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        distributionId={distributionId}
        onAdded={() => { setAddOpen(false); load(); }}
      />
    </div>
  );
}
