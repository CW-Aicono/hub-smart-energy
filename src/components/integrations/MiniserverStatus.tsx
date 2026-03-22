import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, Thermometer, HardDrive, RefreshCw, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface MiniserverStatusProps {
  locationIntegrationId: string;
  integrationType?: string;
  lastSyncAt?: string | null;
}

interface SystemStatus {
  cpu: string | null;
  temperature: string | null;
  memory: string | null;
}

export function MiniserverStatus({ locationIntegrationId, integrationType, lastSyncAt }: MiniserverStatusProps) {
  const isLoxone = !integrationType || integrationType === "loxone" || integrationType === "loxone_miniserver";

  const { data, isLoading, error } = useQuery({
    queryKey: ["miniserver-status", locationIntegrationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("loxone-api", {
        body: { locationIntegrationId, action: "getSystemStatus" },
      });
      if (error || !data?.success) throw new Error(data?.error || "Fehler");
      return data as { systemStatus: SystemStatus; lastSync: string | null };
    },
    enabled: isLoxone,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  if (!isLoxone) return null;

  const systemStatus = data?.systemStatus;
  const syncTime = lastSyncAt || data?.lastSync;

  // Show last sync even while loading or on error
  const items = [
    systemStatus?.cpu != null && {
      icon: Cpu,
      label: "CPU",
      value: String(systemStatus.cpu).replace(/%$/, '') + '%',
    },
    systemStatus?.temperature != null && {
      icon: Thermometer,
      label: "Temp",
      value: `${systemStatus.temperature}°C`,
    },
    systemStatus?.memory != null && {
      icon: HardDrive,
      label: "RAM frei",
      value: `${systemStatus.memory} KB`,
    },
    syncTime && {
      icon: RefreshCw,
      label: "Sync",
      value: formatDistanceToNow(new Date(syncTime), { addSuffix: true, locale: de }),
    },
  ].filter(Boolean) as Array<{ icon: typeof Cpu; label: string; value: string }>;

  if (isLoading && !syncTime) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Systemstatus wird geladen…</span>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1 text-xs text-muted-foreground">
          <item.icon className="h-3 w-3" />
          <span className="font-medium">{item.label}:</span>
          <span>{item.value}</span>
        </span>
      ))}
    </div>
  );
}
