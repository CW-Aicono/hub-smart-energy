import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Zap, PlugZap, AlertTriangle, ZapOff, Pencil, Check, X } from "lucide-react";
import { ChargePointConnector, connectorDisplayName } from "@/hooks/useChargePointConnectors";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const connectorStatusConfig: Record<string, { label: string; color: string; icon: typeof Zap }> = {
  available: { label: "Verfügbar", color: "bg-emerald-500", icon: Zap },
  charging: { label: "Lädt", color: "bg-blue-500", icon: PlugZap },
  unavailable: { label: "Belegt", color: "bg-muted-foreground", icon: ZapOff },
  faulted: { label: "Gestört", color: "bg-destructive", icon: AlertTriangle },
  offline: { label: "Offline", color: "bg-muted-foreground", icon: ZapOff },
};

interface Props {
  connectors: ChargePointConnector[];
  selectedConnectorId?: number | null;
  onSelectConnector?: (connectorId: number) => void;
  selectable?: boolean;
  /** When false, all connectors are shown as "Offline" regardless of DB status */
  wsConnected?: boolean;
  /** Allow inline editing of connector names */
  editable?: boolean;
}

export function ConnectorStatusGrid({ connectors, selectedConnectorId, onSelectConnector, selectable = false, wsConnected = true, editable = false }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

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

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(connectors.length, 4)}, 1fr)` }}>
      {connectors.map((c) => {
        const effectiveStatus = !wsConnected ? "offline" : c.status;
        const cfg = connectorStatusConfig[effectiveStatus] || connectorStatusConfig.offline;
        const Icon = cfg.icon;
        const isSelected = selectedConnectorId === c.connector_id;
        const isEditing = editingId === c.id;

        return (
          <button
            key={c.id}
            type="button"
            disabled={!selectable && !editable}
            onClick={() => selectable && onSelectConnector?.(c.connector_id)}
            className={`
              border rounded-lg p-3 text-center transition-all relative group
              ${selectable ? "cursor-pointer hover:border-primary/50" : editable ? "cursor-default" : "cursor-default"}
              ${isSelected ? "border-primary ring-2 ring-primary/20" : "border-border"}
            `}
          >
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
          </button>
        );
      })}
    </div>
  );
}
