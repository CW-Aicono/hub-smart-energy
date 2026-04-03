import { Activity, Zap, Clock, HardDrive, ArrowDownToLine } from "lucide-react";
import type { GatewayDeviceWithMetrics } from "@/hooks/useGatewayDevices";

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "–";
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.floor(diffH / 24);
  return `vor ${diffD} Tag${diffD > 1 ? "en" : ""}`;
}

interface DeviceMetricsProps {
  device: GatewayDeviceWithMetrics;
}

export function DeviceMetrics({ device }: DeviceMetricsProps) {
  const metrics = [
    {
      icon: Activity,
      label: "Automationen",
      value: device.automationCount ?? 0,
      sublabel: device.activeAutomationCount != null
        ? `${device.activeAutomationCount} aktiv`
        : undefined,
      color: "text-primary",
    },
    {
      icon: Zap,
      label: "Letzte Ausführung",
      value: formatRelativeTime(device.lastExecutionAt),
      color: "text-amber-500",
    },
    {
      icon: ArrowDownToLine,
      label: "Letzter Sync",
      value: formatRelativeTime(device.last_heartbeat_at),
      color: "text-emerald-500",
    },
    ...(device.offline_buffer_count > 0
      ? [{
          icon: HardDrive,
          label: "Gepuffert",
          value: `${device.offline_buffer_count} Readings`,
          color: "text-amber-600",
        }]
      : []),
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-border/50">
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center gap-2 text-xs">
          <m.icon className={`h-3.5 w-3.5 shrink-0 ${m.color}`} />
          <div className="min-w-0">
            <div className="text-muted-foreground truncate">{m.label}</div>
            <div className="font-medium truncate">
              {m.value}
              {m.sublabel && (
                <span className="text-muted-foreground font-normal ml-1">({m.sublabel})</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
