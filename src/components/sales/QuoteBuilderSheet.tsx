import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useModulePrices } from "@/hooks/useModulePrices";
import { toast } from "sonner";
import { Loader2, Sparkles, FileDown, Package } from "lucide-react";
import { ClassBadge } from "./ClassBadge";
import { CompletenessCheck } from "./CompletenessCheck";

const CLASS_LABELS: Record<string, string> = {
  meter: "Zähler",
  gateway: "Gateways & Steuerung",
  power_supply: "Netzteile",
  network_switch: "Netzwerk-Switches",
  router: "Router",
  addon_module: "Addon-Module",
  cable: "Verkabelung",
  accessory: "Zubehör & Montagematerial",
  misc: "Sonstige",
};
const CLASS_ORDER = ["meter", "gateway", "addon_module", "power_supply", "network_switch", "router", "cable", "accessory", "misc"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  kundeTyp: "standard" | "industry";
  onGenerated: () => void;
}

interface Suggestion {
  module_code: string;
  reason: string;
  required: boolean;
}

interface DeviceLine {
  name: string;
  menge: number;
  vk: number;
  inst: number;
  einheit: string;
  klasse: string;
  isChild: boolean;
}

export function QuoteBuilderSheet({ open, onOpenChange, projectId, kundeTyp, onGenerated }: Props) {
  const { prices } = useModulePrices();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [available, setAvailable] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [devices, setDevices] = useState<DeviceLine[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const isIndustry = kundeTyp === "industry";

  useEffect(() => {
    if (!open) return;
    let active = true;
    const init = async () => {
      setLoading(true);
      try {
        // Suggestions
        const { data: sugg, error: sErr } = await supabase.functions.invoke("sales-suggest-modules", {
          body: { project_id: projectId },
        });
        if (sErr) throw sErr;
        if (!active) return;
        const list: Suggestion[] = sugg?.suggestions ?? [];
        setSuggestions(list);
        setAvailable(sugg?.available ?? []);
        const sel = new Set(list.map((s) => s.module_code));
        setSelected(sel);
        const rmap: Record<string, string> = {};
        list.forEach((s) => { rmap[s.module_code] = s.reason; });
        setReasons(rmap);

        // Devices
        const { data: dists } = await supabase
          .from("sales_distributions").select("id").eq("project_id", projectId);
        const distIds = (dists ?? []).map((d) => d.id);
        if (distIds.length === 0) {
          setDevices([]);
        } else {
          const { data: pts } = await supabase
            .from("sales_measurement_points").select("id").in("distribution_id", distIds);
          const ptIds = (pts ?? []).map((p) => p.id);
          if (ptIds.length === 0) {
            setDevices([]);
          } else {
            const { data: recs } = await supabase
              .from("sales_recommended_devices")
              .select("device_catalog_id, menge, ist_alternativ, parent_recommendation_id, geraete_klasse")
              .in("measurement_point_id", ptIds)
              .eq("ist_alternativ", false);
            const ids = Array.from(new Set((recs ?? []).map((r) => r.device_catalog_id)));
            if (ids.length === 0) {
              setDevices([]);
            } else {
              const { data: cat } = await supabase
                .from("device_catalog")
                .select("id, hersteller, modell, vk_preis, installations_pauschale, geraete_klasse, einheit")
                .in("id", ids);
              const catMap = new Map((cat ?? []).map((c) => [c.id, c]));
              const lines: DeviceLine[] = [];
              for (const r of recs ?? []) {
                const c = catMap.get(r.device_catalog_id);
                if (!c) continue;
                lines.push({
                  name: `${c.hersteller} ${c.modell}`,
                  menge: r.menge,
                  vk: Number(c.vk_preis),
                  inst: Number(c.installations_pauschale),
                  einheit: c.einheit ?? "Stück",
                  klasse: c.geraete_klasse ?? r.geraete_klasse ?? "misc",
                  isChild: !!r.parent_recommendation_id,
                });
              }
              setDevices(lines);
            }
          }
        }
      } catch (e) {
        toast.error("Vorbereitung fehlgeschlagen", { description: String(e) });
      } finally {
        if (active) setLoading(false);
      }
    };
    init();
    return () => { active = false; };
  }, [open, projectId]);

  const priceFor = (code: string) => {
    const p = prices.find((pr) => pr.module_code === code);
    if (!p) return 0;
    return Number(isIndustry ? p.industry_price_monthly : p.price_monthly);
  };

  const allModules = useMemo(() => {
    const set = new Set<string>([...available, ...suggestions.map((s) => s.module_code)]);
    return Array.from(set).sort();
  }, [available, suggestions]);

  const toggle = (code: string) => {
    const s = new Set(selected);
    s.has(code) ? s.delete(code) : s.add(code);
    setSelected(s);
  };

  const monthlySum = useMemo(
    () => Array.from(selected).reduce((s, c) => s + priceFor(c), 0),
    [selected, prices, isIndustry],
  );
  const geraeteSumme = devices.reduce((s, d) => s + d.vk * d.menge, 0);
  const installationSumme = devices.reduce((s, d) => s + d.inst * d.menge, 0);
  const einmalig = geraeteSumme + installationSumme;

  const generate = async () => {
    if (selected.size === 0) {
      toast.error("Bitte mindestens ein Modul auswählen");
      return;
    }
    setGenerating(true);
    try {
      const modules = Array.from(selected).map((code) => ({
        module_code: code,
        preis_monatlich: priceFor(code),
      }));
      const { data, error } = await supabase.functions.invoke("sales-generate-quote", {
        body: { project_id: projectId, modules, notes },
      });
      if (error) throw error;
      toast.success(`Angebot v${data.version} erstellt`);
      onGenerated();
      onOpenChange(false);
    } catch (e) {
      toast.error("Generierung fehlgeschlagen", { description: String(e) });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Angebot erstellen
          </SheetTitle>
          <SheetDescription>
            KI-Vorschlag der Module + automatische Geräteliste
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-3 mt-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="space-y-5 mt-4 pb-32">
            {/* Devices */}
            <section>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Package className="h-4 w-4" /> Hardware (einmalig)
              </h3>
              {devices.length === 0 ? (
                <div className="text-sm text-muted-foreground border rounded-md p-3">
                  Keine Geräte ausgewählt. Lege zuerst Empfehlungen pro Messpunkt an.
                </div>
              ) : (
                <div className="border rounded-md divide-y">
                  {devices.map((d, i) => (
                    <div key={i} className="p-2 flex items-center justify-between text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.menge}× · {d.vk.toFixed(2)} € + {d.inst.toFixed(2)} € Inst.
                        </div>
                      </div>
                      <div className="text-sm font-medium tabular-nums">
                        {((d.vk + d.inst) * d.menge).toFixed(2)} €
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-right text-sm mt-2">
                Geräte: <span className="font-medium">{geraeteSumme.toFixed(2)} €</span> · Inst.:{" "}
                <span className="font-medium">{installationSumme.toFixed(2)} €</span>
              </div>
            </section>

            <Separator />

            {/* Modules */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Module ({isIndustry ? "Industrie" : "Standard"})
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {selected.size} / {allModules.length}
                </Badge>
              </div>
              <div className="space-y-1">
                {allModules.map((code) => {
                  const sugg = suggestions.find((s) => s.module_code === code);
                  const checked = selected.has(code);
                  const price = priceFor(code);
                  return (
                    <label
                      key={code}
                      className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                        checked ? "bg-primary/5 border-primary/40" : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(code)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{code}</span>
                          {sugg && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1">
                              KI
                            </Badge>
                          )}
                        </div>
                        {sugg?.reason && (
                          <p className="text-xs text-muted-foreground mt-0.5">{sugg.reason}</p>
                        )}
                      </div>
                      <div className="text-sm tabular-nums font-medium shrink-0">
                        {price.toFixed(2)} €
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <Separator />

            <section className="space-y-2">
              <Label htmlFor="notes">Hinweise (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="z. B. Sonderkonditionen, Installationszeitraum…"
                rows={3}
              />
            </section>
          </div>
        )}

        {/* Sticky footer */}
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Einmalig</div>
              <div className="font-semibold">{einmalig.toFixed(2)} €</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground text-xs">Monatlich</div>
              <div className="font-semibold">{monthlySum.toFixed(2)} €</div>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={generate}
            disabled={generating || loading}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Angebots-PDF generieren
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
