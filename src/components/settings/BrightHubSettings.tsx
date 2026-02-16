import { useState, useEffect } from "react";
import { useBrightHubSettings } from "@/hooks/useBrightHubSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, CloudUpload, Eye, EyeOff, Copy, Check, ChevronRight } from "lucide-react";

interface BrightHubSettingsProps {
  locationId: string;
}

export const BrightHubSettings = ({ locationId }: BrightHubSettingsProps) => {
  const { settings, loading, saveSettings } = useBrightHubSettings(locationId);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
              <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
            </CardTitle>
            <CardDescription>
              Verbinden Sie diesen Standort mit der BrightHub Eventmanagement-Plattform.
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>BrightHub aktivieren</Label>
                <p className="text-sm text-muted-foreground">Synchronisation für diesen Standort ein-/ausschalten</p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>

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

            <div className="space-y-2">
              <Label>Webhook-URL</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="https://... Webhook-URL von BrightHub"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    setCopiedField("url");
                    setTimeout(() => setCopiedField(null), 2000);
                  }}
                >
                  {copiedField === "url" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Die Webhook-URL wird von BrightHub bereitgestellt</p>
            </div>

            <div className="space-y-2">
              <Label>Webhook-Secret</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  placeholder="Webhook-Secret eingeben"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Wird zur HMAC-Signierung der Webhook-Aufrufe verwendet</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Automatische Synchronisation</Label>
                <p className="text-sm text-muted-foreground">
                  Neue Zählerstände automatisch per Webhook an BrightHub senden
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Speichern...</> : "Einstellungen speichern"}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
