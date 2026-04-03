import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";
import type { GatewayDevice } from "@/hooks/useGatewayDevices";

export function StatusBadge({ device }: { device: GatewayDevice }) {
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
