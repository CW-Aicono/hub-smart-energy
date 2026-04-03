import { useGatewayDevices } from "@/hooks/useGatewayDevices";
import { useTranslation } from "@/hooks/useTranslation";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Server } from "lucide-react";
import { DeviceCard } from "./gateway/DeviceCard";

interface GatewayDeviceManagerProps {
  locationIntegrationId?: string;
}

export function GatewayDeviceManager({ locationIntegrationId }: GatewayDeviceManagerProps = {}) {
  const { devices, isLoading, sendCommand, refetch } = useGatewayDevices(locationIntegrationId);
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
            onKeyGenerated={() => refetch()}
          />
        ))}
      </CardContent>
    </Card>
  );
}
