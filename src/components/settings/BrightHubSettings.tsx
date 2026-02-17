import { useState, useEffect } from "react";
import { useBrightHubSettings } from "@/hooks/useBrightHubSettings";
import { syncMeters, syncReadings, syncIntraday } from "@/lib/brighthubApi";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, CloudUpload, Eye, EyeOff, Copy, Check, ChevronRight, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface BrightHubSettingsProps {
  locationId: string;
}

export const BrightHubSettings = ({ locationId }: BrightHubSettingsProps) => {
  const { settings, loading, saveSettings, refetch } = useBrightHubSettings(locationId);
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? "";
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [syncingMeters, setSyncingMeters] = useState(false);
  const [syncingReadings, setSyncingReadings] = useState(false);
  const [syncingIntraday, setSyncingIntraday] = useState(false);

  useEffect(() => {
    if (settings) {
      setApiKey(settings.api_key);
      setWebhookSecret(settings.webhook_secret);
      setWebhookUrl(settings.webhook_url);
      setIsEnabled(settings.is_enabled);
      setAutoSync(settings.auto_sync_readings);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    await saveSettings({
      api_key: apiKey.trim(),
      webhook_secret: webhookSecret.trim(),
      webhook_url: webhookUrl.trim(),
      is_enabled: isEnabled,
      auto_sync_readings: autoSync,
    });
    setSaving(false);
  };

  const handleSyncMeters = async () => {
    if (!tenantId) return;
    setSyncingMeters(true);
    try {
      const result = await syncMeters(tenantId, locationId);
      toast.success(`Zähler synchronisiert: ${result.sent} gesendet`, {
        description: result.summary
          ? `Erstellt: ${result.summary.created}, Aktualisiert: ${result.summary.updated}, Archiviert: ${result.summary.archived ?? 0}`
          : undefined,
      });
      refetch();
    } catch (err) {
      toast.error("Zähler-Sync fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } finally {
      setSyncingMeters(false);
    }
  };

  const handleSyncReadings = async () => {
    if (!tenantId) return;
    setSyncingReadings(true);
    try {
      const result = await syncReadings(tenantId, locationId);
      toast.success(`Messwerte synchronisiert: ${result.sent} gesendet`);
      refetch();
    } catch (err) {
      toast.error("Messwerte-Sync fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } finally {
      setSyncingReadings(false);
    }
  };

  const handleSyncIntraday = async () => {
    if (!tenantId) return;
    setSyncingIntraday(true);
    try {
      const result = await syncIntraday(tenantId, locationId);
      toast.success(`Leistungsdaten synchronisiert: ${result.sent} gesendet`);
      refetch();
    } catch (err) {
      toast.error("Leistungsdaten-Sync fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } finally {
      setSyncingIntraday(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Noch nie";
    try {
      return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: de });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none">
            <CardTitle className="flex items-center gap-2">
              <CloudUpload className="h-5 w-5" />
              BrightHub Synchronisation
              {settings?.is_enabled && <Badge variant="secondary" className="ml-1 text-xs">Aktiv</Badge>}
              <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
            </CardTitle>
            <CardDescription>
              Verbinden Sie diesen Standort mit der BrightHub Eventmanagement-Plattform.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>BrightHub aktivieren</Label>
                <p className="text-sm text-muted-foreground">Synchronisation für diesen Standort ein-/ausschalten</p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label>API-Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  placeholder="BrightHub API-Key eingeben"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Wird in BrightHub unter Einstellungen → API generiert</p>
            </div>

            {/* Auto sync toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Automatische Synchronisation</Label>
                <p className="text-sm text-muted-foreground">
                  Zähler täglich und Messwerte alle 15 Minuten automatisch synchronisieren
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            {/* Save button */}
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Speichern...</> : "Einstellungen speichern"}
            </Button>

            {/* Manual sync section */}
            {settings?.is_enabled && settings?.api_key && (
              <div className="border-t pt-4 space-y-4">
                <h4 className="text-sm font-medium">Manuelle Synchronisation</h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button
                    variant="outline"
                    onClick={handleSyncMeters}
                    disabled={syncingMeters}
                    className="w-full"
                  >
                    {syncingMeters ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Zähler synchronisieren
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSyncReadings}
                    disabled={syncingReadings}
                    className="w-full"
                  >
                    {syncingReadings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    Messwerte synchronisieren
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSyncIntraday}
                    disabled={syncingIntraday}
                    className="w-full"
                  >
                    {syncingIntraday ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    Leistungsdaten (kW)
                  </Button>
                </div>

                {/* Last sync timestamps */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-muted-foreground text-xs">Letzter Zähler-Sync</p>
                    <p className="font-medium">{formatDate((settings as any).last_meter_sync_at)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-muted-foreground text-xs">Letzter Messwerte-Sync</p>
                    <p className="font-medium">{formatDate((settings as any).last_reading_sync_at)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-muted-foreground text-xs">Letzter Leistungsdaten-Sync</p>
                    <p className="font-medium">{formatDate((settings as any).last_intraday_sync_at)}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
