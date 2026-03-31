import { useGatewayDevices, type GatewayDevice } from "@/hooks/useGatewayDevices";
import { useTranslation } from "@/hooks/useTranslation";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  ArrowUpCircle,
  HardDrive,
  Clock,
} from "lucide-react";

interface GatewayDeviceManagerProps {
  locationIntegrationId?: string;
}

function StatusBadge({ device }: { device: GatewayDevice }) {
  const isOnline = device.status === "online";
  const hasBuffer = device.offline_buffer_count > 0;

  if (isOnline && hasBuffer) {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
        <Wifi className="h-3 w-3 mr-1" />
        Sync ({device.offline_buffer_count})
      </Badge>
    );
  }
  if (isOnline) {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
        <Wifi className="h-3 w-3 mr-1" />
        Online
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
      <WifiOff className="h-3 w-3 mr-1" />
      Offline
    </Badge>
  );
}

function DeviceCard({
  device,
  onCommand,
  isAdmin,
}: {
  device: GatewayDevice;
  onCommand: (deviceId: string, command: string) => void;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const hasUpdate =
    device.latest_available_version &&
    device.addon_version &&
    device.latest_available_version !== device.addon_version;

  const lastSeen = device.last_heartbeat_at
    ? new Date(device.last_heartbeat_at).toLocaleString()
    : "–";

  return (
    <div className="flex items-start justify-between p-4 rounded-lg border bg-card">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-muted p-2">
          <Server className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{device.device_name}</span>
            <StatusBadge device={device} />
            {hasUpdate && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                <ArrowUpCircle className="h-3 w-3 mr-1" />
                {t("gatewayDevices.updateAvailable" as any)}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {device.addon_version && (
              <span>Add-on v{device.addon_version}</span>
            )}
            {device.ha_version && (
              <span>HA {device.ha_version}</span>
            )}
            {device.local_ip && (
              <span>{device.local_ip}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastSeen}
            </span>
            {device.offline_buffer_count > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <HardDrive className="h-3 w-3" />
                {device.offline_buffer_count} {t("gatewayDevices.buffered" as any)}
              </span>
            )}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCommand(device.id, "backup")}
            title={t("gatewayDevices.backup" as any)}
          >
            <Download className="h-4 w-4" />
          </Button>
          {hasUpdate && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCommand(device.id, "update")}
              title={t("gatewayDevices.update" as any)}
            >
              <ArrowUpCircle className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCommand(device.id, "restart")}
            title={t("gatewayDevices.restart" as any)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function GatewayDeviceManager({ locationIntegrationId }: GatewayDeviceManagerProps) {
  const { devices, isLoading, sendCommand } = useGatewayDevices(locationIntegrationId);
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (devices.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          {t("gatewayDevices.title" as any)}
        </CardTitle>
        <CardDescription>
          {t("gatewayDevices.subtitle" as any)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onCommand={(deviceId, command) => sendCommand({ deviceId, command })}
            isAdmin={isAdmin}
          />
        ))}
      </CardContent>
    </Card>
  );
}
