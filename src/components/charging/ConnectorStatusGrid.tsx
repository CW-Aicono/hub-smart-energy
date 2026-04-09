import { Badge } from "@/components/ui/badge";
import { Zap, PlugZap, AlertTriangle, ZapOff } from "lucide-react";
import { ChargePointConnector } from "@/hooks/useChargePointConnectors";

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
}

export function ConnectorStatusGrid({ connectors, selectedConnectorId, onSelectConnector, selectable = false, wsConnected = true }: Props) {
  if (connectors.length === 0) return null;

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(connectors.length, 4)}, 1fr)` }}>
      {connectors.map((c) => {
        const effectiveStatus = !wsConnected ? "offline" : c.status;
        const cfg = connectorStatusConfig[effectiveStatus] || connectorStatusConfig.offline;
        const Icon = cfg.icon;
        const isSelected = selectedConnectorId === c.connector_id;

        return (
          <button
            key={c.id}
            type="button"
            disabled={!selectable}
            onClick={() => selectable && onSelectConnector?.(c.connector_id)}
            className={`
              border rounded-lg p-3 text-center transition-all
              ${selectable ? "cursor-pointer hover:border-primary/50" : "cursor-default"}
              ${isSelected ? "border-primary ring-2 ring-primary/20" : "border-border"}
            `}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className={`h-2.5 w-2.5 rounded-full ${cfg.color}`} />
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xs font-medium">Anschluss {c.connector_id}</p>
            <p className="text-[10px] text-muted-foreground">{cfg.label}</p>
            <p className="text-[10px] text-muted-foreground">{c.connector_type} · {c.max_power_kw} kW</p>
          </button>
        );
      })}
    </div>
  );
}
