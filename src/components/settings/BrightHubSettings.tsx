import { useState, useEffect } from "react";
import { useBrightHubSettings } from "@/hooks/useBrightHubSettings";
import { syncMeters, syncReadings, syncIntraday } from "@/lib/brighthubApi";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, CloudUpload, Eye, EyeOff, ChevronRight, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de, enUS, es, nl } from "date-fns/locale";

interface BrightHubSettingsProps {
  locationId: string;
}

export const BrightHubSettings = ({ locationId }: BrightHubSettingsProps) => {
  const { settings, loading, saveSettings, refetch } = useBrightHubSettings(locationId);
  const { tenant } = useTenant();
  const { t, language } = useTranslation();
  const T = (key: string) => t(key as any);
  const tenantId = tenant?.id ?? "";
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [open, setOpen] = useState(false);
  const [syncingMeters, setSyncingMeters] = useState(false);
  const [syncingReadings, setSyncingReadings] = useState(false);
  const [syncingIntraday, setSyncingIntraday] = useState(false);
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [webhookSecretDirty, setWebhookSecretDirty] = useState(false);

  const dateLocale = language === "de" ? de : language === "es" ? es : language === "nl" ? nl : enUS;

  useEffect(() => {
    if (settings) {
      setApiKey(settings.api_key || "");
      setWebhookSecret(settings.webhook_secret || "");
      setWebhookUrl(settings.webhook_url || "");
      setIsEnabled(settings.is_enabled);
      setAutoSync(settings.auto_sync_readings);
      setApiKeyDirty(false);
      setWebhookSecretDirty(false);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    await saveSettings({
      api_key: apiKeyDirty ? apiKey.trim() : settings?.api_key || "",
      webhook_secret: webhookSecretDirty ? webhookSecret.trim() : settings?.webhook_secret || "",
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
      toast.success(T("bh.metersSynced").replace("{count}", String(result.sent)), {
        description: result.summary
          ? T("bh.metersSyncDetail").replace("{created}", String(result.summary.created)).replace("{updated}", String(result.summary.updated)).replace("{archived}", String(result.summary.archived ?? 0))
          : undefined,
      });
      refetch();
    } catch (err) {
      toast.error(T("bh.metersSyncFailed"), { description: err instanceof Error ? err.message : T("bh.unknownError") });
    } finally {
      setSyncingMeters(false);
    }
  };

  const handleSyncReadings = async () => {
    if (!tenantId) return;
    setSyncingReadings(true);
    try {
      const result = await syncReadings(tenantId, locationId);
      toast.success(T("bh.readingsSynced").replace("{count}", String(result.sent)));
      refetch();
    } catch (err) {
      toast.error(T("bh.readingsSyncFailed"), { description: err instanceof Error ? err.message : T("bh.unknownError") });
    } finally {
      setSyncingReadings(false);
    }
  };

  const handleSyncIntraday = async () => {
    if (!tenantId) return;
    setSyncingIntraday(true);
    try {
      const result = await syncIntraday(tenantId, locationId);
      toast.success(T("bh.intradaySynced").replace("{count}", String(result.sent)));
      refetch();
    } catch (err) {
      toast.error(T("bh.intradaySyncFailed"), { description: err instanceof Error ? err.message : T("bh.unknownError") });
    } finally {
      setSyncingIntraday(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return T("bh.never");
    try {
      return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: dateLocale });
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
              {T("bh.title")}
              {settings?.is_enabled && <Badge variant="secondary" className="ml-1 text-xs">{T("bh.active")}</Badge>}
              <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
            </CardTitle>
            <CardDescription>{T("bh.subtitle")}</CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>{T("bh.enable")}</Label>
                <p className="text-sm text-muted-foreground">{T("bh.enableDesc")}</p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>

            <div className="space-y-2">
              <Label>{T("bh.apiKey")}</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? "text" : "password"}
                  placeholder={T("bh.apiKeyPlaceholder")}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setApiKeyDirty(true); }}
                  onFocus={() => {
                    if (!apiKeyDirty && apiKey.startsWith("••••••")) {
                      setApiKey("");
                      setApiKeyDirty(true);
                    }
                  }}
                />
                <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{T("bh.apiKeyHint")}</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{T("bh.autoSync")}</Label>
                <p className="text-sm text-muted-foreground">{T("bh.autoSyncDesc")}</p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {T("bh.saving")}</> : T("bh.saveSettings")}
            </Button>

            {settings?.is_enabled && settings?._has_api_key && (
              <div className="border-t pt-4 space-y-4">
                <h4 className="text-sm font-medium">{T("bh.manualSync")}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button variant="outline" onClick={handleSyncMeters} disabled={syncingMeters} className="w-full">
                    {syncingMeters ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {T("bh.syncMeters")}
                  </Button>
                  <Button variant="outline" onClick={handleSyncReadings} disabled={syncingReadings} className="w-full">
                    {syncingReadings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    {T("bh.syncReadings")}
                  </Button>
                  <Button variant="outline" onClick={handleSyncIntraday} disabled={syncingIntraday} className="w-full">
                    {syncingIntraday ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    {T("bh.syncIntraday")}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-muted-foreground text-xs">{T("bh.lastMeterSync")}</p>
                    <p className="font-medium">{formatDate(settings.last_meter_sync_at)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-muted-foreground text-xs">{T("bh.lastReadingSync")}</p>
                    <p className="font-medium">{formatDate(settings.last_reading_sync_at)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-muted-foreground text-xs">{T("bh.lastIntradaySync")}</p>
                    <p className="font-medium">{formatDate(settings.last_intraday_sync_at)}</p>
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
