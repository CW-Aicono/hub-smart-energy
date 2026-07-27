import { useQuery } from "@tanstack/react-query";
import { Cpu, Thermometer, HardDrive, RefreshCw, Loader2, Clock, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { invokeWithRetry } from "@/lib/invokeWithRetry";

interface MiniserverStatusProps {
  locationIntegrationId: string;
  integrationType?: string;
  lastSyncAt?: string | null;
  syncStatus?: string | null;
}

interface SystemStatus {
  cpu: string | null;
  temperature: string | null;
  memory: string | null;
  localTime: string | null;
}

interface SystemStatusResponse {
  success?: boolean;
  error?: string;
  systemStatus: SystemStatus;
  lastSync: string | null;
}

export function MiniserverStatus({ locationIntegrationId, integrationType, lastSyncAt, syncStatus }: MiniserverStatusProps) {
  const isLoxone = !integrationType || integrationType === "loxone" || integrationType === "loxone_miniserver";

  const { data, isLoading, error } = useQuery({
    queryKey: ["miniserver-status", locationIntegrationId],
    queryFn: async () => {
      const { data, error } = await invokeWithRetry<SystemStatusResponse>("loxone-api", {
        body: { locationIntegrationId, action: "getSystemStatus" },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || "Fehler");
      }

      return data;
    },
    enabled: isLoxone,
    staleTime: 120_000,
    refetchInterval: 300_000,
    retry: 2,
  });

  if (!isLoxone) return null;

  const systemStatus = data?.systemStatus;
  // last_sync_at wird bei jedem Sync-Versuch aktualisiert (auch bei Fehlern).
  // Wir zeigen ihn nur bei erfolgreichem Sync als "Sync: …" an; bei Fehlern
  // erscheint stattdessen ein Fehler-Hinweis mit "Letzter Versuch: …".
  const isErrorStatus = syncStatus === "error" || syncStatus === "auth_failed";
  const syncTimeRaw = lastSyncAt || data?.lastSync;
  const syncTime = !isErrorStatus ? syncTimeRaw : null;

  const items = [
    systemStatus?.localTime != null && {
      icon: Clock,
      label: "Uhrzeit",
      value: systemStatus.localTime,
      tone: "muted" as const,
    },
    systemStatus?.cpu != null && {
      icon: Cpu,
      label: "CPU",
      value: String(systemStatus.cpu).replace(/%$/, '') + '%',
      tone: "muted" as const,
    },
    systemStatus?.temperature != null && {
      icon: Thermometer,
      label: "Temp",
      value: `${systemStatus.temperature}°C`,
      tone: "muted" as const,
    },
    systemStatus?.memory != null && {
      icon: HardDrive,
      label: "RAM frei",
      value: `${systemStatus.memory} KB`,
      tone: "muted" as const,
    },
    syncTime && {
      icon: RefreshCw,
      label: "Sync",
      value: formatDistanceToNow(new Date(syncTime), { addSuffix: true, locale: de }),
      tone: "muted" as const,
    },
    isErrorStatus && {
      icon: AlertTriangle,
      label: syncStatus === "auth_failed" ? "Zugangsdaten prüfen" : "Sync fehlgeschlagen",
      value: syncTimeRaw
        ? `Letzter Versuch ${formatDistanceToNow(new Date(syncTimeRaw), { addSuffix: true, locale: de })}`
        : "kein erfolgreicher Sync",
      tone: "destructive" as const,
    },
  ].filter(Boolean) as Array<{ icon: typeof Cpu; label: string; value: string; tone: "muted" | "destructive" }>;

  if (isLoading && !syncTime && !isErrorStatus) {
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
        <span
          key={item.label}
          className={`flex items-center gap-1 text-xs ${item.tone === "destructive" ? "text-destructive" : "text-muted-foreground"}`}
        >
          <item.icon className="h-3 w-3" />
          <span className="font-medium">{item.label}:</span>
          <span>{item.value}</span>
        </span>
      ))}
    </div>
  );
}

