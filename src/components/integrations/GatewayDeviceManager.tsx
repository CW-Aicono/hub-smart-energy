import { useGatewayDevices, type GatewayDevice } from "@/hooks/useGatewayDevices";
import { useTranslation } from "@/hooks/useTranslation";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  Download,
  ArrowUpCircle,
  HardDrive,
  Clock,
  Key,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

/** Generate a cryptographically secure API key */
function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `gw_${hex}`;
}

/** SHA-256 hash a string (matches gateway-ingest server-side logic) */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ApiKeyDialog({
  device,
  open,
  onOpenChange,
  onKeyGenerated,
}: {
  device: GatewayDevice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyGenerated: () => void;
}) {
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    setSaving(true);
    try {
      const newKey = generateApiKey();
      const keyHash = await hashApiKey(newKey);

      const { error } = await supabase
        .from("gateway_devices")
        .update({ api_key_hash: keyHash } as any)
        .eq("id", device.id);

      if (error) throw error;

      setGeneratedKey(newKey);
      onKeyGenerated();
      toast.success("API-Key wurde generiert");
    } catch (err) {
      toast.error("Fehler beim Generieren des API-Keys");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    toast.success("API-Key kopiert");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setGeneratedKey(null);
      setCopied(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Device API-Key: {device.device_name}
          </DialogTitle>
          <DialogDescription>
            {generatedKey
              ? "Der API-Key wird nur einmal angezeigt. Kopiere ihn jetzt und trage ihn in der Add-on-Konfiguration ein."
              : "Generiere einen eigenen API-Key für dieses Gateway-Gerät. Der Key ersetzt den globalen Gateway-Key und bietet bessere Sicherheit im Multi-Tenant-Betrieb."
            }
          </DialogDescription>
        </DialogHeader>

        {generatedKey ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                value={generatedKey}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
              <p className="font-medium">⚠️ Wichtig</p>
              <p className="mt-1">
                Dieser Key wird nur jetzt angezeigt. Kopiere ihn und trage ihn als <code className="bg-muted px-1 rounded">gateway_api_key</code> in der Add-on-Konfiguration ein.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {device.api_key_hash ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Dieses Gerät hat bereits einen eigenen API-Key. Ein neuer Key ersetzt den bestehenden.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldAlert className="h-4 w-4" />
                <span>Dieses Gerät nutzt aktuell den globalen Gateway-Key.</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {generatedKey ? (
            <Button onClick={() => handleClose(false)}>
              Schließen
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleGenerate} disabled={saving}>
                {saving ? "Wird generiert..." : device.api_key_hash ? "Neuen Key generieren" : "Key generieren"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const hasUpdate =
    device.latest_available_version &&
    device.addon_version &&
    device.latest_available_version !== device.addon_version;

  const lastSeen = device.last_heartbeat_at
    ? new Date(device.last_heartbeat_at).toLocaleString()
    : "–";

  return (
    <>
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
              {device.api_key_hash ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Device-Key
                </Badge>
              ) : null}
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
              onClick={() => setKeyDialogOpen(true)}
              title="API-Key verwalten"
            >
              <Key className="h-4 w-4" />
            </Button>
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

      {isAdmin && (
        <ApiKeyDialog
          device={device}
          open={keyDialogOpen}
          onOpenChange={setKeyDialogOpen}
          onKeyGenerated={() => {}}
        />
      )}
    </>
  );
}

export function GatewayDeviceManager({ locationIntegrationId }: GatewayDeviceManagerProps) {
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
          />
        ))}
      </CardContent>
    </Card>
  );
}
