import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Search, Package } from "lucide-react";
import { toast } from "sonner";
import { ClassBadge, CLASS_LABELS } from "./ClassBadge";

interface CatalogDevice {
  id: string;
  hersteller: string;
  modell: string;
  vk_preis: number;
  geraete_klasse: string;
  einheit: string;
  beschreibung: string | null;
  bild_url: string | null;
}

const HARDWARE_CLASSES = [
  "all", "gateway", "network_switch", "router",
  "power_supply", "addon_module", "cable", "accessory", "misc",
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  distributionId: string;
  onAdded: () => void;
}

export function AddHardwareDialog({ open, onOpenChange, distributionId, onAdded }: Props) {
  const [devices, setDevices] = useState<CatalogDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [klasse, setKlasse] = useState<string>("all");
  const [adding, setAdding] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("device_catalog")
        .select("id, hersteller, modell, vk_preis, geraete_klasse, einheit, beschreibung, bild_url")
        .neq("geraete_klasse", "meter")
        .eq("is_active", true)
        .order("hersteller", { ascending: true });
      if (!active) return;
      if (error) {
        toast.error("Katalog laden fehlgeschlagen", { description: error.message });
      } else {
        setDevices((data ?? []) as CatalogDevice[]);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (klasse !== "all" && d.geraete_klasse !== klasse) return false;
      if (!q) return true;
      return (
        d.hersteller.toLowerCase().includes(q) ||
        d.modell.toLowerCase().includes(q) ||
        (d.beschreibung ?? "").toLowerCase().includes(q)
      );
    });
  }, [devices, search, klasse]);

  const addDevice = async (d: CatalogDevice) => {
    setAdding(d.id);
    const menge = Math.max(1, quantities[d.id] ?? 1);

    const { data: newRec, error } = await supabase
      .from("sales_recommended_devices")
      .insert({
        distribution_id: distributionId,
        measurement_point_id: null,
        scope: "distribution",
        device_catalog_id: d.id,
        menge,
        ist_alternativ: false,
        source: "manual",
        begruendung: "Manuell zur Verteilung hinzugefügt",
        geraete_klasse: d.geraete_klasse,
      })
      .select("id")
      .single();

    if (error || !newRec) {
      setAdding(null);
      toast.error("Hinzufügen fehlgeschlagen", { description: error?.message });
      return;
    }

    // Pflicht-Zubehör automatisch anlegen
    try {
      const { data: compat } = await supabase
        .from("device_compatibility")
        .select("target_device_id, auto_quantity_formula, relation_type, target:target_device_id(geraete_klasse)")
        .eq("source_device_id", d.id)
        .eq("relation_type", "requires");

      for (const c of (compat ?? []) as any[]) {
        // einfache Formel-Auswertung: Zahl oder source.menge
        let qty = 1;
        const f = (c.auto_quantity_formula ?? "1").trim();
        if (/^\d+$/.test(f)) qty = parseInt(f);
        else if (f === "source.menge") qty = menge;

        await supabase.from("sales_recommended_devices").insert({
          distribution_id: distributionId,
          measurement_point_id: null,
          scope: "distribution",
          device_catalog_id: c.target_device_id,
          menge: qty,
          ist_alternativ: false,
          source: "rule",
          begruendung: `Pflicht-Zubehör für ${d.hersteller} ${d.modell}`,
          parent_recommendation_id: newRec.id,
          geraete_klasse: c.target?.geraete_klasse,
        });
      }
    } catch (e) {
      console.warn("Pflicht-Zubehör konnte nicht ergänzt werden", e);
    }

    setAdding(null);
    toast.success(`${d.hersteller} ${d.modell} hinzugefügt`);
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Hardware zur Verteilung hinzufügen
          </DialogTitle>
          <DialogDescription>
            Gateways, Switches, Netzteile und sonstige Komponenten, die nicht direkt einem Messpunkt zugeordnet sind.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <Tabs value={klasse} onValueChange={setKlasse}>
            <ScrollArea className="w-full">
              <TabsList className="inline-flex w-auto">
                {HARDWARE_CLASSES.map((k) => (
                  <TabsTrigger key={k} value={k} className="text-xs">
                    {k === "all" ? "Alle" : CLASS_LABELS[k] ?? k}
                  </TabsTrigger>
                ))}
              </TabsList>
            </ScrollArea>
          </Tabs>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Hersteller, Modell oder Beschreibung suchen…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <ScrollArea className="flex-1 -mx-1 px-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Keine Geräte gefunden.
              </div>
            ) : (
              <div className="space-y-2 pb-2">
                {filtered.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 rounded-md border p-2.5 bg-card">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ClassBadge klasse={d.geraete_klasse} />
                        <span className="text-sm font-medium truncate">
                          {d.hersteller} {d.modell}
                        </span>
                      </div>
                      {d.beschreibung && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {d.beschreibung}
                        </p>
                      )}
                      <p className="text-xs font-medium mt-0.5 tabular-nums">
                        {Number(d.vk_preis).toFixed(2)} € / {d.einheit ?? "Stück"}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      className="w-16 h-8 text-sm"
                      value={quantities[d.id] ?? 1}
                      onChange={(e) =>
                        setQuantities((q) => ({ ...q, [d.id]: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                    />
                    <Button
                      size="sm"
                      onClick={() => addDevice(d)}
                      disabled={adding === d.id}
                    >
                      {adding === d.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
