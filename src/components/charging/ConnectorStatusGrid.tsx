import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Zap, PlugZap, AlertTriangle, ZapOff, Pencil, Check, X, GripVertical, Clock } from "lucide-react";
import { ChargePointConnector, connectorDisplayName } from "@/hooks/useChargePointConnectors";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { normalizeConnectorStatus } from "@/lib/formatCharging";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

const connectorStatusConfig: Record<string, { label: string; color: string; icon: typeof Zap }> = {
  available: { label: "Verfügbar", color: "bg-emerald-500", icon: Zap },
  charging: { label: "Lädt", color: "bg-blue-500", icon: PlugZap },
  unavailable: { label: "Belegt", color: "bg-muted-foreground", icon: ZapOff },
  faulted: { label: "Gestört", color: "bg-destructive", icon: AlertTriangle },
  offline: { label: "Offline", color: "bg-muted-foreground", icon: ZapOff },
};

// Connector data is considered stale if last contact is older than 5 minutes.
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Liveness der Wallbox: nutzt den jüngsten Zeitstempel aus
 *   (a) StatusNotification (last_status_at)  und
 *   (b) Heartbeat der gesamten Wallbox (lastHeartbeat).
 * StatusNotifications kommen nur bei Status-Wechseln, daher ist der Heartbeat
 * der bessere "ist online"-Indikator, sobald keine Wechsel mehr passieren.
 */
function getStaleness(lastStatusAt: string | null, lastHeartbeat?: string | null): { isStale: boolean; ageMs: number | null; label: string } {
  const candidates = [lastStatusAt, lastHeartbeat]
    .filter(Boolean)
    .map((ts) => new Date(ts as string).getTime());
  if (candidates.length === 0) return { isStale: true, ageMs: null, label: "noch keine Daten" };
  const newest = Math.max(...candidates);
  const ageMs = Date.now() - newest;
  const label = formatDistanceToNow(new Date(newest), { addSuffix: true, locale: de });
  return { isStale: ageMs > STALE_THRESHOLD_MS, ageMs, label };
}

interface Props {
  connectors: ChargePointConnector[];
  selectedConnectorId?: number | null;
  onSelectConnector?: (connectorId: number) => void;
  selectable?: boolean;
  wsConnected?: boolean;
  lastHeartbeat?: string | null;
  editable?: boolean;
  onReorder?: (reordered: ChargePointConnector[]) => void;
}

export function ConnectorStatusGrid({ connectors, selectedConnectorId, onSelectConnector, selectable = false, wsConnected = true, lastHeartbeat = null, editable = false, onReorder }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  if (connectors.length === 0) return null;

  const startEdit = (c: ChargePointConnector, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditName(c.name || "");
  };

  const saveEdit = async (c: ChargePointConnector) => {
    const trimmed = editName.trim();
    await supabase
      .from("charge_point_connectors")
      .update({ name: trimmed || null } as any)
      .eq("id", c.id);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
    setDragging(true);
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      setDragging(false);
      return;
    }
    const reordered = [...connectors];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    dragItem.current = null;
    dragOverItem.current = null;
    setDragging(false);
    onReorder?.(reordered);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(connectors.length, 4)}, 1fr)` }}>
        {connectors.map((c, index) => {
          const effectiveStatus = normalizeConnectorStatus(c.status, wsConnected);
          const cfg = connectorStatusConfig[effectiveStatus] || connectorStatusConfig.offline;
          const Icon = cfg.icon;
          const isSelected = selectedConnectorId === c.connector_id;
          const isEditing = editingId === c.id;
          const canDrag = editable && onReorder && connectors.length > 1;
          const stale = getStaleness(c.last_status_at, lastHeartbeat);

          return (
            <button
              key={c.id}
              type="button"
              disabled={!selectable && !editable}
              draggable={canDrag ? true : false}
              onDragStart={() => canDrag && handleDragStart(index)}
              onDragEnter={() => canDrag && handleDragEnter(index)}
              onDragEnd={() => canDrag && handleDragEnd()}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onClick={() => selectable && onSelectConnector?.(c.connector_id)}
              className={`
                border rounded-lg p-3 text-center transition-all relative group
                ${selectable ? "cursor-pointer hover:border-primary/50" : editable ? "cursor-default" : "cursor-default"}
                ${isSelected ? "border-primary ring-2 ring-primary/20" : "border-border"}
                ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}
              `}
            >
              {canDrag && (
                <div className="absolute top-1 left-1 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
                  <GripVertical className="h-3.5 w-3.5" />
                </div>
              )}
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span className={`h-2.5 w-2.5 rounded-full ${cfg.color}`} />
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              {isEditing ? (
                <div className="flex items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    className="h-6 text-xs px-1 py-0"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={`Anschluss ${c.connector_id}`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(c);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <button type="button" onClick={() => saveEdit(c)} className="text-primary hover:text-primary/80"><Check className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <p className="text-xs font-medium">{connectorDisplayName(c)}</p>
                  {editable && (
                    <button type="button" onClick={(e) => startEdit(c, e)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">{cfg.label}</p>
              <p className="text-[10px] text-muted-foreground">{c.connector_type} · {c.max_power_kw} kW</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`mt-1 flex items-center justify-center gap-1 text-[10px] ${
                      stale.isStale ? "text-amber-600 dark:text-amber-500 font-medium" : "text-muted-foreground"
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Clock className="h-2.5 w-2.5" />
                    <span>{stale.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {c.last_status_at || lastHeartbeat ? (
                    <>
                      {c.last_status_at && (
                        <>Letzte Statusmeldung:<br />{new Date(c.last_status_at).toLocaleString("de-DE")}<br /></>
                      )}
                      {lastHeartbeat && (
                        <>Letzter Heartbeat:<br />{new Date(lastHeartbeat).toLocaleString("de-DE")}</>
                      )}
                      {stale.isStale && (
                        <div className="mt-1 text-amber-500">
                          ⚠ Daten älter als 5 Minuten – Wallbox meldet sich nicht zuverlässig.
                        </div>
                      )}
                    </>
                  ) : (
                    "Noch keine Statusmeldung von der Wallbox empfangen."
                  )}
                </TooltipContent>
              </Tooltip>
            </button>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
