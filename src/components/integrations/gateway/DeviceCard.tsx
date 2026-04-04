import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import type { GatewayDeviceWithMetrics } from "@/hooks/useGatewayDevices";
import { StatusBadge } from "./StatusBadge";
import { ApiKeyDialog } from "./ApiKeyDialog";
import { PinConfigDialog } from "./PinConfigDialog";
import { DeviceMetrics } from "./DeviceMetrics";
import {
  Server,
  RefreshCw,
  Download,
  ArrowUpCircle,
  Clock,
  Key,
  Lock,
  ShieldCheck,
} from "lucide-react";

interface DeviceCardProps {
  device: GatewayDeviceWithMetrics;
  onCommand: (deviceId: string, command: string) => void;
  isAdmin: boolean;
  onKeyGenerated: () => void;
}

export function DeviceCard({ device, onCommand, isAdmin, onKeyGenerated }: DeviceCardProps) {
  const { t } = useTranslation();
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const hasUpdate =
    device.latest_available_version &&
    device.addon_version &&
    device.latest_available_version !== device.addon_version;

  const lastSeen = device.last_heartbeat_at
    ? new Date(device.last_heartbeat_at).toLocaleString()
    : "–";

  const uptimeMs = device.last_heartbeat_at && device.status === "online"
    ? Date.now() - new Date(device.created_at).getTime()
    : null;
  const uptimeDays = uptimeMs ? Math.floor(uptimeMs / 86_400_000) : null;

  return (
    <>
      <div className="rounded-lg border bg-card p-4 space-y-0">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-muted p-2">
              <Server className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{device.device_name}</span>
                <StatusBadge device={device} />
                {hasUpdate && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                    <ArrowUpCircle className="h-3 w-3 mr-1" />
                    Update
                  </Badge>
                )}
                {device.api_key_hash && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Device-Key
                  </Badge>
                )}
                {(device.config as any)?.ui_pin_hash && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                    <Lock className="h-3 w-3 mr-1" />
                    PIN
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {device.addon_version && <span>Add-on v{device.addon_version}</span>}
                {device.ha_version && <span>HA {device.ha_version}</span>}
                {device.local_ip && <span>{device.local_ip}</span>}
                {uptimeDays != null && uptimeDays > 0 && (
                  <span>{uptimeDays}d Uptime</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {lastSeen}
                </span>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setKeyDialogOpen(true)} title={t("gatewayDevices.apiKey")}>
                <Key className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onCommand(device.id, "backup")} title={t("gatewayDevices.backup")}>
                <Download className="h-4 w-4" />
              </Button>
              {hasUpdate && (
                <Button variant="ghost" size="icon" onClick={() => onCommand(device.id, "update")} title={t("gatewayDevices.update")}>
                  <ArrowUpCircle className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => onCommand(device.id, "restart")} title={t("gatewayDevices.restart")}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Metrics row */}
        <DeviceMetrics device={device} />
      </div>

      {isAdmin && (
        <ApiKeyDialog
          device={device}
          open={keyDialogOpen}
          onOpenChange={setKeyDialogOpen}
          onKeyGenerated={onKeyGenerated}
        />
      )}
    </>
  );
}
