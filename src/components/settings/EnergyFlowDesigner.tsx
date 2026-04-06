import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  EnergyFlowNode,
  EnergyFlowConnection,
  EnergyFlowNodeRole,
} from "@/hooks/useCustomWidgetDefinitions";
import { Plus, X, Link2, Trash2, Unlink } from "lucide-react";

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
  nodes,
  connections,
  onRemoveNode,
  onRemoveConnection,
}: {
  node: EnergyFlowNode;
  nodes: EnergyFlowNode[];
  connections: EnergyFlowConnection[];
  onRemoveNode: () => void;
  onRemoveConnection: (connectionIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);

  // Find connections involving this node (with their original index)
  const nodeConnections = connections
    .map((c, i) => ({ ...c, idx: i }))
    .filter((c) => c.from === node.id || c.to === node.id);

  const getLabel = (id: string) => nodes.find((n) => n.id === id)?.label || "?";

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
        {nodeConnections.length > 0 && (
          <>
            <div className="border-t my-1" />
            <p className="text-[11px] text-muted-foreground px-2 py-0.5">Verbindungen:</p>
            {nodeConnections.map((c) => {
              const otherLabel = c.from === node.id ? getLabel(c.to) : getLabel(c.from);
              return (
                <Button
                  key={c.idx}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs gap-2"
                  onClick={() => {
                    onRemoveConnection(c.idx);
                    // Close if no more connections remain
                    if (nodeConnections.length <= 1) setOpen(false);
                  }}
                >
                  <Unlink className="h-3.5 w-3.5" />
                  {node.label} → {otherLabel}
                </Button>
              );
            })}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function EnergyFlowDesigner({ nodes, connections, meters, onChange }: Props) {
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number } | null>(null);

  const addNode = () => {
    const id = crypto.randomUUID();
    const newNode: EnergyFlowNode = {
      id,
      role: "consumer",
      label: "Neu",
      meter_id: "",
      color: DEFAULT_COLORS.consumer,
      x: 50,
      y: 50,
    };
    onChange([...nodes, newNode], connections);
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
    onChange(
      nodes.filter((n) => n.id !== id),
      connections.filter((c) => c.from !== id && c.to !== id),
    );
  };

  const toggleConnection = (nodeId: string) => {
    if (!connectFrom) {
      setConnectFrom(nodeId);
      return;
    }
    if (connectFrom === nodeId) {
      setConnectFrom(null);
      return;
    }
    // Check if connection exists
    const exists = connections.some(
      (c) =>
        (c.from === connectFrom && c.to === nodeId) ||
        (c.from === nodeId && c.to === connectFrom),
    );
    if (exists) {
      onChange(
        nodes,
        connections.filter(
          (c) =>
            !(c.from === connectFrom && c.to === nodeId) &&
            !(c.from === nodeId && c.to === connectFrom),
        ),
      );
    } else {
      onChange(nodes, [...connections, { from: connectFrom, to: nodeId }]);
    }
    setConnectFrom(null);
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

  // Group meters by energy type
  const meterGroups = (meters || []).reduce<Record<string, any[]>>((acc, m: any) => {
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
                    {Object.entries(meterGroups).map(([type, groupMeters]) => (
                      groupMeters.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({type})
                        </SelectItem>
                      ))
                    ))}
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
                <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                  {f?.label || "?"} → {t?.label || "?"}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
