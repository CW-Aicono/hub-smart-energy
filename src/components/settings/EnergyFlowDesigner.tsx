import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocations } from "@/hooks/useLocations";
import { formatEnergyType } from "@/lib/energyTypeLabels";
import {
  EnergyFlowNode,
  EnergyFlowConnection,
  EnergyFlowNodeRole,
} from "@/hooks/useCustomWidgetDefinitions";
import { Plus, X, Trash2, RotateCcw, AlertCircle } from "lucide-react";
import { computeRadialDefault, applyRadialLayout } from "@/lib/energyFlowLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const NODE_ROLES: { value: EnergyFlowNodeRole; label: string }[] = [
  { value: "pv", label: "PV / Solar" },
  { value: "grid", label: "Netz" },
  { value: "house", label: "Haus / Gebäude" },
  { value: "battery", label: "Batterie" },
  { value: "wallbox", label: "Wallbox / E-Auto" },
  { value: "heatpump", label: "Wärmepumpe" },
  { value: "consumer", label: "Verbraucher" },
];

const DEFAULT_COLORS: Record<EnergyFlowNodeRole, string> = {
  pv: "#f59e0b",
  grid: "#3b82f6",
  house: "#f97316",
  battery: "#ec4899",
  wallbox: "#06b6d4",
  heatpump: "#a855f7",
  consumer: "#10b981",
};

interface Props {
  nodes: EnergyFlowNode[];
  connections: EnergyFlowConnection[];
  meters: any[];
  locationId: string;
  gatewayDeviceIds: string[];
  onChange: (
    nodes: EnergyFlowNode[],
    connections: EnergyFlowConnection[],
    scope: { locationId: string; gatewayDeviceIds: string[] },
  ) => void;
}

function NodeDeletePopover({
  node,
  onRemoveNode,
}: {
  node: EnergyFlowNode;
  onRemoveNode: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2 space-y-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={() => setOpen(false)}
        >
          Abbrechen
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs text-destructive hover:text-destructive gap-2"
          onClick={() => {
            onRemoveNode();
            setOpen(false);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Knoten löschen
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function EnergyFlowDesigner({ nodes, connections, meters, locationId, gatewayDeviceIds, onChange }: Props) {
  const { tenant } = useTenant();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number } | null>(null);

  const scope = { locationId, gatewayDeviceIds };
  const scopeReady = !!locationId && gatewayDeviceIds.length > 0;

  const addNode = () => {
    const id = crypto.randomUUID();
    const newIndex = nodes.length;
    const total = nodes.length + 1;
    const rebalanced = nodes.map((n, i) => ({
      ...n,
      ...computeRadialDefault(i, total),
    }));
    const pos = computeRadialDefault(newIndex, total);
    const newNode: EnergyFlowNode = {
      id,
      role: "consumer",
      label: "Neu",
      meter_id: "",
      color: DEFAULT_COLORS.consumer,
      x: pos.x,
      y: pos.y,
    };
    onChange([...rebalanced, newNode], connections, scope);
  };

  const updateNode = (id: string, patch: Partial<EnergyFlowNode>) => {
    const updated = nodes.map((n) => {
      if (n.id !== id) return n;
      const merged = { ...n, ...patch };
      if (patch.role && !patch.color) {
        merged.color = DEFAULT_COLORS[patch.role];
      }
      return merged;
    });
    onChange(updated, connections, scope);
  };

  const removeNode = (id: string) => {
    const remaining = nodes.filter((n) => n.id !== id);
    const relayed = applyRadialLayout(remaining);
    onChange(relayed, connections.filter((c) => c.from !== id && c.to !== id), scope);
  };

  const resetLayout = () => {
    onChange(applyRadialLayout(nodes), connections, scope);
  };




  // Drag handling on the visual canvas
  const handlePointerDown = useCallback(
    (nodeId: string, e: React.PointerEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      dragRef.current = { nodeId, startX: e.clientX, startY: e.clientY };

      const handleMove = (me: PointerEvent) => {
        if (!dragRef.current || !canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((me.clientY - rect.top) / rect.height) * 100));
        updateNode(dragRef.current.nodeId, { x: Math.round(x), y: Math.round(y) });
      };

      const handleUp = () => {
        dragRef.current = null;
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
      };

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, connections],
  );

  const { locations } = useLocations();

  // Load gateways (= data-source integrations) for the currently selected location.
  // We treat every enabled location_integration as a "Gateway", because non-HA
  // integrations (Loxone Miniserver, Shelly Cloud, Schneider, …) do not create
  // rows in gateway_devices but still deliver meter data. Status is enriched
  // from gateway_devices when a matching row exists.
  const gatewayQuery = useQuery({
    queryKey: ["energyflow-gateways", tenant?.id, locationId],
    enabled: !!tenant?.id && !!locationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: lis, error: liErr } = await supabase
        .from("location_integrations")
        .select("id, integration_id, is_enabled, config, integrations(name, type)")
        .eq("location_id", locationId)
        .eq("is_enabled", true);
      if (liErr) throw liErr;
      const liIds = (lis || []).map((r: any) => r.id);
      if (liIds.length === 0) return { devices: [] as any[] };

      const { data: devs } = await supabase
        .from("gateway_devices")
        .select("id, device_name, device_type, status, location_integration_id")
        .eq("tenant_id", tenant!.id)
        .in("location_integration_id", liIds);

      const byLi = new Map<string, any>();
      (devs || []).forEach((d: any) => byLi.set(d.location_integration_id, d));

      const devices = (lis || []).map((li: any) => {
        const gw = byLi.get(li.id);
        const integrationName = li.integrations?.name || li.integrations?.type || "Integration";
        const configName = (li.config as any)?.device_name || (li.config as any)?.name;
        return {
          id: li.id, // location_integration.id — used as scope key
          device_name: gw?.device_name || configName || integrationName,
          device_type: gw?.device_type || integrationName,
          status: gw?.status || "online",
        };
      });
      return { devices };
    },
  });

  const gateways = gatewayQuery.data?.devices ?? [];

  // gateway.id is already the location_integration.id, so this is a direct set.
  const selectedGatewayIntegrationIds = useMemo(
    () => new Set(gatewayDeviceIds),
    [gatewayDeviceIds],
  );

  // Filter state for the meter picker inside each node card
  const [filterCategory, setFilterCategory] = useState<EnergyFlowNodeRole | "__all__">("__all__");
  const [filterEnergyType, setFilterEnergyType] = useState<string>("__all__");

  const CATEGORY_KEYWORDS: Record<EnergyFlowNodeRole, string[]> = {
    pv: ["pv", "solar", "photovoltaik", "wechselrichter", "inverter", "erzeug"],
    grid: ["netz", "grid", "einspei", "bezug", "hausanschluss", "zählpunkt"],
    house: ["haus", "gebäude", "gebaeude", "verbrauch gesamt", "allgemein"],
    battery: ["batterie", "battery", "speicher", "akku"],
    wallbox: ["wallbox", "ladepunkt", "ladesäule", "ladesaeule", "charger", "e-auto", "ev "],
    heatpump: ["wärmepumpe", "waermepumpe", "heat pump", "wp "],
    consumer: [],
  };

  const meterMatchesCategory = (m: any, role: EnergyFlowNodeRole): boolean => {
    if (role === "consumer") return true;
    const kws = CATEGORY_KEYWORDS[role] || [];
    const hay = `${m.name || ""} ${m.device_type || ""} ${m.energy_type || ""}`.toLowerCase();
    return kws.some((k) => hay.includes(k));
  };

  // Meters restricted to the selected location and gateways
  const scopedMeters = useMemo(() => {
    if (!scopeReady) return [] as any[];
    return (meters || []).filter((m: any) => {
      if (m.location_id !== locationId) return false;
      // Manual meters (no integration) always allowed within the location
      if (!m.location_integration_id) return true;
      return selectedGatewayIntegrationIds.has(m.location_integration_id);
    });
  }, [meters, locationId, selectedGatewayIntegrationIds, scopeReady]);

  const energyTypeOptions = useMemo(() => {
    const set = new Set<string>();
    scopedMeters.forEach((m: any) => m.energy_type && set.add(m.energy_type));
    return Array.from(set).sort();
  }, [scopedMeters]);

  const filteredMeters = useMemo(() => {
    return scopedMeters.filter((m: any) => {
      if (filterEnergyType !== "__all__" && m.energy_type !== filterEnergyType) return false;
      if (filterCategory !== "__all__" && !meterMatchesCategory(m, filterCategory)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedMeters, filterEnergyType, filterCategory]);

  const locationName = (id: string) => locations.find((l) => l.id === id)?.name || "–";

  // Reset invalid meter references whenever scope changes
  useEffect(() => {
    if (!scopeReady) return;
    const validIds = new Set(scopedMeters.map((m: any) => m.id));
    let mutated = false;
    const cleaned = nodes.map((n) => {
      if (n.meter_id && !validIds.has(n.meter_id)) {
        mutated = true;
        return { ...n, meter_id: "" };
      }
      return n;
    });
    if (mutated) {
      toast.info("Einige Knoten wurden getrennt, weil ihre Zähler nicht mehr zur gewählten Liegenschaft/Gateway-Auswahl passen.");
      onChange(cleaned, connections, scope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, gatewayDeviceIds.join(",")]);

  const toggleGateway = (id: string) => {
    const next = gatewayDeviceIds.includes(id)
      ? gatewayDeviceIds.filter((x) => x !== id)
      : [...gatewayDeviceIds, id];
    onChange(nodes, connections, { locationId, gatewayDeviceIds: next });
  };

  const setLocation = (id: string) => {
    // Location change resets gateway selection
    onChange(nodes, connections, { locationId: id, gatewayDeviceIds: [] });
  };

  const statusDot = (status?: string) => {
    const color =
      status === "online" ? "bg-emerald-500" :
      status === "error" ? "bg-amber-500" :
      status === "offline" ? "bg-red-500" : "bg-muted-foreground";
    return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
  };



  return (
    <div className="space-y-4">
      {/* Scope: Liegenschaft + Gateways (Pflicht) */}
      <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Datenbereich (Pflicht)
        </Label>
        <div className="space-y-2">
          <Label className="text-xs">Liegenschaft</Label>
          <Select value={locationId || ""} onValueChange={setLocation}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Liegenschaft wählen" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {locationId && (
          <div className="space-y-2">
            <Label className="text-xs">Gateways (mindestens eins)</Label>
            {gatewayQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Gateways werden geladen…</p>
            ) : gateways.length === 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  Für diese Liegenschaft ist noch kein Gateway eingerichtet.{" "}
                  <a href="/integrations" className="underline underline-offset-2">
                    Zur Integrationsverwaltung
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
                {gateways.map((g: any) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
                  >
                    <Checkbox
                      checked={gatewayDeviceIds.includes(g.id)}
                      onCheckedChange={() => toggleGateway(g.id)}
                    />
                    {statusDot(g.status)}
                    <span className="flex-1 truncate">{g.device_name}</span>
                    <span className="text-xs text-muted-foreground">{g.device_type}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!scopeReady && (
        <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          Bitte zuerst eine Liegenschaft und mindestens ein Gateway auswählen, bevor Knoten hinzugefügt werden können.
        </div>
      )}

      {scopeReady && (
      <>
      {/* Visual canvas */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Layout (Knoten per Drag & Drop positionieren)</Label>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={nodes.length === 0}
              >
                <RotateCcw className="h-3 w-3" />
                Anordnung zurücksetzen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Anordnung zurücksetzen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle manuell per Drag & Drop gesetzten Positionen werden verworfen und
                  die Knoten wieder gleichmäßig um den Zentralknoten verteilt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={resetLayout}>Zurücksetzen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div
          ref={canvasRef}
          className="relative border rounded-lg bg-card aspect-video overflow-hidden select-none"
          style={{ touchAction: "none" }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {nodes.map((node) => (
              <line
                key={node.id}
                x1={`${node.x}%`}
                y1={`${node.y}%`}
                x2="50%"
                y2="50%"
                stroke={node.color}
                strokeWidth={2}
                strokeOpacity={0.4}
              />
            ))}
          </svg>

          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden
          >
            <div className="w-6 h-6 rounded-full bg-muted border border-muted-foreground/50" />
          </div>

          {nodes.map((node) => (
            <div
              key={node.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
              }}
              onPointerDown={(e) => handlePointerDown(node.id, e)}
            >
              <div
                className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-[10px] font-semibold bg-background"
                style={{ borderColor: node.color, color: node.color }}
              >
                {node.label.slice(0, 2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Node list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Knoten</Label>
          <Button type="button" variant="outline" size="sm" onClick={addNode} className="gap-1">
            <Plus className="h-3 w-3" /> Knoten hinzufügen
          </Button>
        </div>

        {/* Filter für die Zähler-Auswahl */}
        <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Zähler-Filter
            </Label>
            {(filterCategory !== "__all__" || filterEnergyType !== "__all__") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  setFilterCategory("__all__");
                  setFilterEnergyType("__all__");
                }}
              >
                Zurücksetzen
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Select
              value={filterCategory}
              onValueChange={(v) => setFilterCategory(v as EnergyFlowNodeRole | "__all__")}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Kategorien</SelectItem>
                {NODE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterEnergyType} onValueChange={setFilterEnergyType}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Energieart" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Energiearten</SelectItem>
                {energyTypeOptions.map((t) => (
                  <SelectItem key={t} value={t}>{formatEnergyType(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {filteredMeters.length} von {scopedMeters.length} Zählern sichtbar

          </p>
        </div>


        <div className="space-y-3 max-h-64 overflow-auto">
          {nodes.map((node) => (
            <div key={node.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={node.label}
                  onChange={(e) => updateNode(node.id, { label: e.target.value })}
                  className="h-8 text-sm flex-1"
                  placeholder="Label"
                />
                <Input
                  type="color"
                  value={node.color}
                  onChange={(e) => updateNode(node.id, { color: e.target.value })}
                  className="h-8 w-8 p-0 border-0 cursor-pointer shrink-0"
                />
                <NodeDeletePopover
                  node={node}
                  onRemoveNode={() => removeNode(node.id)}
                />
              </div>


              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={node.role}
                  onValueChange={(v) => updateNode(node.id, { role: v as EnergyFlowNodeRole })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NODE_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={node.meter_id || "__none__"}
                  onValueChange={(v) => updateNode(node.id, { meter_id: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Zähler wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Kein Zähler</SelectItem>
                    {(() => {
                      // Bereits in anderen Knoten belegte Zähler ausblenden
                      const usedByOthers = new Set(
                        nodes
                          .filter((n) => n.id !== node.id && n.meter_id)
                          .map((n) => n.meter_id as string),
                      );
                      const visible = new Map<string, any>();
                      filteredMeters.forEach((m: any) => {
                        if (!usedByOthers.has(m.id)) visible.set(m.id, m);
                      });
                      // Ensure the currently selected meter is always visible,
                      // even if it doesn't match the active filters
                      if (node.meter_id && !visible.has(node.meter_id)) {
                        const sel = (meters || []).find((m: any) => m.id === node.meter_id);
                        if (sel) visible.set(sel.id, sel);
                      }
                      const grouped = Array.from(visible.values()).reduce<Record<string, any[]>>(
                        (acc, m: any) => {
                          const t = m.energy_type || "Sonstige";
                          (acc[t] ||= []).push(m);
                          return acc;
                        },
                        {},
                      );
                      const entries = Object.entries(grouped);
                      if (entries.length === 0) {
                        return (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Keine Zähler passen zu den Filtern
                          </div>
                        );
                      }
                      return entries.map(([type, groupMeters]) =>
                        groupMeters.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                            <span className="text-muted-foreground">
                              {" "}· {formatEnergyType(type)} · {locationName(m.location_id)}
                            </span>
                          </SelectItem>
                        )),
                      );
                    })()}
                  </SelectContent>

                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
