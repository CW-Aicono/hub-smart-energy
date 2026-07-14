import { useState, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocations } from "@/hooks/useLocations";
import { formatEnergyType } from "@/lib/energyTypeLabels";
import {
  EnergyFlowNode,
  EnergyFlowConnection,
  EnergyFlowNodeRole,
} from "@/hooks/useCustomWidgetDefinitions";
import { Plus, X, Trash2, RotateCcw } from "lucide-react";
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
  onChange: (nodes: EnergyFlowNode[], connections: EnergyFlowConnection[]) => void;
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

export function EnergyFlowDesigner({ nodes, connections, meters, onChange }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number } | null>(null);

  const addNode = () => {
    const id = crypto.randomUUID();
    const newIndex = nodes.length;
    const total = nodes.length + 1;
    // Neuer Knoten radial platzieren und bestehende Knoten neu verteilen,
    // damit gleiche Winkelabstände erhalten bleiben.
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
    onChange([...rebalanced, newNode], connections);
  };

  const updateNode = (id: string, patch: Partial<EnergyFlowNode>) => {
    const updated = nodes.map((n) => {
      if (n.id !== id) return n;
      const merged = { ...n, ...patch };
      // Auto-set color when role changes
      if (patch.role && !patch.color) {
        merged.color = DEFAULT_COLORS[patch.role];
      }
      return merged;
    });
    onChange(updated, connections);
  };

  const removeNode = (id: string) => {
    const remaining = nodes.filter((n) => n.id !== id);
    // Neu verteilen, damit die Anordnung weiterhin gleichmäßig bleibt.
    const relayed = applyRadialLayout(remaining);
    onChange(relayed, connections.filter((c) => c.from !== id && c.to !== id));
  };

  const resetLayout = () => {
    onChange(applyRadialLayout(nodes), connections);
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

  // Filter state for the meter picker inside each node card
  const [filterLocation, setFilterLocation] = useState<string>("__all__");
  const [filterCategory, setFilterCategory] = useState<EnergyFlowNodeRole | "__all__">("__all__");
  const [filterEnergyType, setFilterEnergyType] = useState<string>("__all__");

  // Keyword-based mapping of a meter to a node "category" (role)
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

  const energyTypeOptions = useMemo(() => {
    const set = new Set<string>();
    (meters || []).forEach((m: any) => m.energy_type && set.add(m.energy_type));
    return Array.from(set).sort();
  }, [meters]);

  const filteredMeters = useMemo(() => {
    return (meters || []).filter((m: any) => {
      if (filterLocation !== "__all__" && m.location_id !== filterLocation) return false;
      if (filterEnergyType !== "__all__" && m.energy_type !== filterEnergyType) return false;
      if (filterCategory !== "__all__" && !meterMatchesCategory(m, filterCategory)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meters, filterLocation, filterEnergyType, filterCategory]);

  const locationName = (id: string) => locations.find((l) => l.id === id)?.name || "–";

  // Group filtered meters by energy type for the picker
  const meterGroups = filteredMeters.reduce<Record<string, any[]>>((acc, m: any) => {
    const t = m.energy_type || "Sonstige";
    if (!acc[t]) acc[t] = [];
    acc[t].push(m);
    return acc;
  }, {});


  return (
    <div className="space-y-4">
      {/* Visual canvas */}
      <div className="space-y-2">
        <Label>Layout (Knoten per Drag & Drop positionieren)</Label>
        <div
          ref={canvasRef}
          className="relative border rounded-lg bg-card aspect-video overflow-hidden select-none"
          style={{ touchAction: "none" }}
        >
          {/* Connection lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {connections.map((conn, i) => {
              const f = nodes.find((n) => n.id === conn.from);
              const t = nodes.find((n) => n.id === conn.to);
              if (!f || !t) return null;
              return (
                <line
                  key={i}
                  x1={`${f.x}%`}
                  y1={`${f.y}%`}
                  x2={`${t.x}%`}
                  y2={`${t.y}%`}
                  stroke={f.color}
                  strokeWidth={2}
                  strokeOpacity={0.5}
                />
              );
            })}
          </svg>

          {/* Draggable nodes */}
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
                className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-[10px] font-semibold"
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

        {connectFrom && (
          <div className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">
            Klicke auf einen zweiten Knoten, um eine Verbindung herzustellen/zu entfernen.
          </div>
        )}

        {/* Filter für die Zähler-Auswahl */}
        <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Zähler-Filter
            </Label>
            {(filterLocation !== "__all__" ||
              filterCategory !== "__all__" ||
              filterEnergyType !== "__all__") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  setFilterLocation("__all__");
                  setFilterCategory("__all__");
                  setFilterEnergyType("__all__");
                }}
              >
                Zurücksetzen
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Liegenschaft" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alle Liegenschaften</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            {filteredMeters.length} von {(meters || []).length} Zählern sichtbar
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
                <Button
                  type="button"
                  variant={connectFrom === node.id ? "default" : "outline"}
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => toggleConnection(node.id)}
                  title="Verbindung erstellen"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
                <NodeDeletePopover
                  node={node}
                  nodes={nodes}
                  connections={connections}
                  onRemoveNode={() => removeNode(node.id)}
                  onRemoveConnection={(idx) => {
                    const updated = connections.filter((_, i) => i !== idx);
                    onChange(nodes, updated);
                  }}
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
                      // Ensure the currently selected meter is always visible,
                      // even if it doesn't match the active filters
                      const visible = new Map<string, any>();
                      filteredMeters.forEach((m: any) => visible.set(m.id, m));
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

      {/* Connections summary */}
      {connections.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Verbindungen ({connections.length})</Label>
          <div className="flex flex-wrap gap-1">
            {connections.map((c, i) => {
              const f = nodes.find((n) => n.id === c.from);
              const t = nodes.find((n) => n.id === c.to);
              return (
                <span key={i} className="text-xs bg-muted pl-2 pr-1 py-0.5 rounded-full inline-flex items-center gap-1">
                  {f?.label || "?"} → {t?.label || "?"}
                  <button
                    type="button"
                    aria-label="Verbindung entfernen"
                    className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={() => onChange(nodes, connections.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
