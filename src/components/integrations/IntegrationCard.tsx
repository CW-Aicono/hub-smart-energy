import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Server, Trash2, Pencil, CheckCircle2, XCircle, Clock, Loader2, Gauge, RefreshCw } from "lucide-react";
import { LocationIntegration } from "@/hooks/useIntegrations";
import { SensorsDialog } from "./SensorsDialog";
import { DeviceCard } from "./gateway/DeviceCard";
import { useUserRole } from "@/hooks/useUserRole";
import { MiniserverStatus } from "./MiniserverStatus";
import { EditIntegrationDialog } from "./EditIntegrationDialog";
import { getGatewayDefinition, getEdgeFunctionName } from "@/lib/gatewayRegistry";
import { LoxoneFirmwareSection } from "./LoxoneFirmwareSection";
import { SchneiderSetupInfo } from "./SchneiderSetupInfo";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGatewayDevices } from "@/hooks/useGatewayDevices";

interface IntegrationCardProps {
  locationIntegration: LocationIntegration;
  onUpdate: (id: string, updates: Partial<LocationIntegration>) => Promise<{ error: Error | null }>;
  onDelete: (id: string) => Promise<{ error: Error | null }>;
}

export function IntegrationCard({ locationIntegration, onUpdate, onDelete }: IntegrationCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [sensorsOpen, setSensorsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillFrom, setBackfillFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  });
  const [backfillTo, setBackfillTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  const integration = locationIntegration.integration;
  const config = locationIntegration.config as Record<string, unknown>;
  const gatewayDef = integration ? getGatewayDefinition(integration.type) : undefined;

  const isLoxone = integration?.type === "loxone" || integration?.type === "loxone_miniserver";
  const isAiconoGateway = integration?.type === "aicono_gateway";

  // Fetch only the gateway devices linked to THIS location_integration so each
  // location card shows its own hub (avoids cross-tenant duplicate display).
  const { devices: gatewayDevices, sendCommand, refetch: refetchDevices } = useGatewayDevices(locationIntegration.id, locationIntegration.location_id);
  const gatewayLocalTime = !isLoxone && gatewayDevices.length > 0 ? gatewayDevices[0].local_time : null;

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsToggling(true);
    const { error } = await onUpdate(locationIntegration.id, { is_enabled: enabled });
    setIsToggling(false);
    if (error) {
      toast({ title: t("intCard.error" as any), description: t("intCard.statusChangeError" as any), variant: "destructive" });
    } else {
      toast({
        title: enabled ? t("intCard.activated" as any) : t("intCard.deactivated" as any),
        description: t("intCard.toggleDesc" as any).replace("{state}", enabled ? t("intCard.activated" as any).toLowerCase() : t("intCard.deactivated" as any).toLowerCase()),
      });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const { error } = await onDelete(locationIntegration.id);
    setIsDeleting(false);
    if (error) {
      toast({ title: t("intCard.error" as any), description: t("intCard.deleteError" as any), variant: "destructive" });
    } else {
      toast({ title: t("intCard.deleted" as any), description: t("intCard.deletedDesc" as any) });
    }
  };

  const handleBackfill = async () => {
    setIsBackfilling(true);
    try {
      const edgeFunction = getEdgeFunctionName(locationIntegration.integration?.type || "");
      const { data, error } = await supabase.functions.invoke(edgeFunction, {
        body: { locationIntegrationId: locationIntegration.id, action: "backfillStatistics", fromDate: backfillFrom, toDate: backfillTo },
      });
      if (error || !data?.success) {
        toast({ title: "Fehler", description: data?.error || error?.message || "Backfill fehlgeschlagen", variant: "destructive" });
      } else {
        const msg = data.message || `${data.backfilled} Datenpunkte nachgetragen`;
        const details = `Dateien gefunden: ${data.totalFilesFound ?? '?'}, Matched: ${data.matchedFiles ?? '?'}, Meter: ${data.linkedMeterCount ?? '?'}`;
        toast({ title: "Backfill abgeschlossen", description: `${msg}\n${details}` });
        console.log("Backfill result:", JSON.stringify(data, null, 2));
        if (data.errors && data.errors.length > 0) {
          console.warn("Backfill warnings:", data.errors);
        }
      }
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setIsBackfilling(false);
    }
  };

  const isConfigured = (() => {
    if (isAiconoGateway) return true;
    if (!gatewayDef || !config) return false;
    return gatewayDef.configFields.filter((f) => f.required).every((f) => { const val = config[f.name]; return val && String(val).length > 0; });
  })();

  const configSubtitle = (() => {
    if (isAiconoGateway) {
      const count = gatewayDevices.length;
      if (count === 0) return "Warte auf Hub-Verbindung…";
      return count === 1 ? "1 Hub verbunden" : `${count} Hubs verbunden`;
    }
    if (!gatewayDef || !config) return t("intCard.notConfigured" as any);
    const firstField = gatewayDef.configFields.find((f) => f.type !== "password" && config[f.name]);
    if (!firstField) return t("intCard.notConfigured" as any);
    return `${firstField.label}: ${config[firstField.name]}`;
  })();

  const getSyncStatusBadge = () => {
    if (!isConfigured && !isAiconoGateway) {
      return <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-border"><Clock className="h-3 w-3" />{t("intCard.notConfigured" as any)}</Badge>;
    }
    // For AICONO Gateway parent cards: derive status from connected child gateway_devices
    // (the parent itself never syncs – it's a virtual container for the push-based hubs).
    if (isAiconoGateway) {
      const hasOnlineChild = gatewayDevices.some((d) => d.status === "online");
      if (hasOnlineChild) {
        return <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/20"><CheckCircle2 className="h-3 w-3" />{t("intCard.connected" as any)}</Badge>;
      }
      if (gatewayDevices.length > 0) {
        return <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/20"><XCircle className="h-3 w-3" />Offline</Badge>;
      }
      return <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-border"><Clock className="h-3 w-3" />{t("intCard.pending" as any)}</Badge>;
    }
    switch (locationIntegration.sync_status) {
      case "success": return <Badge variant="outline" className="gap-1 bg-primary/10 text-primary border-primary/20"><CheckCircle2 className="h-3 w-3" />{t("intCard.connected" as any)}</Badge>;
      case "error": return <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/20"><XCircle className="h-3 w-3" />{t("intCard.error" as any)}</Badge>;
      case "syncing": return <Badge variant="outline" className="gap-1 bg-secondary text-secondary-foreground border-border"><Loader2 className="h-3 w-3 animate-spin" />{t("intCard.syncing" as any)}</Badge>;
      default: return <Badge variant="outline" className="gap-1 bg-muted text-muted-foreground border-border"><Clock className="h-3 w-3" />{t("intCard.pending" as any)}</Badge>;
    }
  };

  return (
    <>
      <Card className={`transition-opacity ${!locationIntegration.is_enabled ? "opacity-60" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Server className="h-5 w-5 text-primary" /></div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{integration?.name || "Integration"}</h4>
                  {getSyncStatusBadge()}
                </div>
                <p className="text-sm text-muted-foreground">{configSubtitle}</p>
                {gatewayLocalTime && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Gateway-Zeit: {new Date(gatewayLocalTime).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  </p>
                )}
                <MiniserverStatus
                  locationIntegrationId={locationIntegration.id}
                  integrationType={integration?.type}
                  lastSyncAt={locationIntegration.last_sync_at}
                />
                {integration?.description && <p className="text-xs text-muted-foreground">{integration.description}</p>}
                {integration?.type === "loxone_miniserver" && isConfigured && (
                  <LoxoneFirmwareSection locationIntegrationId={locationIntegration.id} />
                )}
                {integration?.type === "schneider_panel_server" && isConfigured && gatewayDef?.setupInstructions && (
                  <SchneiderSetupInfo config={config} setupInstructions={gatewayDef.setupInstructions} />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setSensorsOpen(true)} title={t("intCard.showSensors" as any)}><Gauge className="h-4 w-4" /></Button>
              {/* Backfill Re-Sync Button */}
              {integration?.type === "loxone_miniserver" && isConfigured && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Daten nachträglich abrufen">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Historische Daten nachträglich abrufen</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        <span>Fehlende Messdaten werden für den gewählten Zeitraum vom Miniserver abgerufen und nachgetragen.</span>
                        <span className="block p-3 rounded-md bg-muted text-muted-foreground text-xs leading-relaxed">
                          <strong>Hinweis:</strong> Die Genauigkeit hängt von der im Miniserver konfigurierten Statistik-Frequenz ab (z.B. 5 Min, 15 Min). Je feiner die Frequenz, desto genauer die nachgetragenen Daten.
                        </span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="backfill-from" className="text-sm">Von</Label>
                        <Input id="backfill-from" type="date" value={backfillFrom} onChange={(e) => setBackfillFrom(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="backfill-to" className="text-sm">Bis</Label>
                        <Input id="backfill-to" type="date" value={backfillTo} onChange={(e) => setBackfillTo(e.target.value)} />
                      </div>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBackfill} disabled={isBackfilling}>
                        {isBackfilling ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Wird abgerufen…</>) : "Daten abrufen"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Switch checked={locationIntegration.is_enabled} onCheckedChange={handleToggleEnabled} disabled={isToggling} />
              <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} title={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("intCard.removeTitle" as any)}</AlertDialogTitle>
                    <AlertDialogDescription>{t("intCard.removeDesc" as any).replace("{name}", integration?.name || "")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {isDeleting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("intCard.removing" as any)}</>) : t("intCard.remove" as any)}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {/* Inline gateway devices for HA integrations */}
          {isAiconoGateway && gatewayDevices.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
              {gatewayDevices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onCommand={(deviceId, command) => sendCommand({ deviceId, command })}
                  isAdmin={isAdmin}
                  onKeyGenerated={() => refetchDevices()}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <SensorsDialog locationIntegration={locationIntegration} open={sensorsOpen} onOpenChange={setSensorsOpen} locationId={locationIntegration.location_id} />
      <EditIntegrationDialog locationIntegration={locationIntegration} open={editOpen} onOpenChange={setEditOpen} onUpdate={onUpdate} />
    </>
  );
}
