import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Eye, EyeOff, Check, ExternalLink } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { toast } from "sonner";

export function ApiSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchApiInfo = async (reveal = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("api-key-info", {
        body: null,
        method: "GET",
        headers: reveal ? undefined : undefined,
      });

      // Use query param for reveal – invoke via fetch directly
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const baseUrl = `https://${projectId}.supabase.co`;
      const url = `${baseUrl}/functions/v1/api-key-info${reveal ? "?reveal=true" : ""}`;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await resp.json();

      if (!resp.ok || !result.success) {
        throw new Error(result.error || "Failed to fetch API info");
      }

      setApiKey(result.api_key);
      setEndpoint(result.endpoint);
      setRevealed(reveal);
    } catch (err) {
      console.error("API info fetch error:", err);
      toast.error(t("api.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(t("api.copied"));
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const toggleReveal = () => {
    if (revealed) {
      // Re-fetch masked
      fetchApiInfo(false);
    } else {
      fetchApiInfo(true);
    }
  };

  // Fetch on mount
  if (!apiKey && !loading) {
    fetchApiInfo(false);
  }

  const routes = [
    { method: "GET", action: "list-locations", desc: t("api.route.listLocations") },
    { method: "GET", action: "list-meters", desc: t("api.route.listMeters") },
    { method: "GET", action: "get-daily-totals", desc: t("api.route.getDailyTotals") },
    { method: "GET", action: "get-readings", desc: t("api.route.getReadings") },
    { method: "GET", action: "get-locations-summary", desc: t("api.route.getLocationsSummary") },
    { method: "POST", action: "(default)", desc: t("api.route.pushReadings") },
    { method: "POST", action: "compact-day", desc: t("api.route.compactDay") },
  ];

  return (
    <div className="space-y-6">
      {/* Endpoint & Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">{t("api.credentials")} <HelpTooltip text="Verwenden Sie Endpoint und API-Key, um Daten programmatisch abzufragen oder von externen Systemen zu importieren." /></CardTitle>
          <CardDescription>{t("api.credentialsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("api.endpoint")}</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={endpoint || "..."}
                className="font-mono text-sm bg-muted"
              />
              {endpoint && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(endpoint, "endpoint")}
                >
                  {copiedField === "endpoint" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("api.apiKey")}</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={apiKey || "..."}
                className="font-mono text-sm bg-muted"
                type={revealed ? "text" : "text"}
              />
              {apiKey && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleReveal}
                    disabled={loading}
                  >
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (!revealed) {
                        toast.info(t("api.revealFirst"));
                        return;
                      }
                      copyToClipboard(apiKey, "apikey");
                    }}
                  >
                    {copiedField === "apikey" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("api.apiKeyHint")}</p>
          </div>
        </CardContent>
      </Card>

      {/* Available Routes */}
      <Card>
        <CardHeader>
          <CardTitle>{t("api.availableRoutes")}</CardTitle>
          <CardDescription>{t("api.availableRoutesDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">{t("api.method")}</th>
                  <th className="text-left p-3 font-medium">Action</th>
                  <th className="text-left p-3 font-medium">{t("api.description")}</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3">
                      <Badge variant={r.method === "GET" ? "secondary" : "default"} className="font-mono">
                        {r.method}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs">{r.action}</td>
                    <td className="p-3 text-muted-foreground">{r.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Usage hint */}
      <Card>
        <CardHeader>
          <CardTitle>{t("api.usageTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`# Beispiel: Tagessummen abrufen
curl -H "Authorization: Bearer <API_KEY>" \\
  "${endpoint || "<ENDPOINT>"}?action=get-daily-totals&from=2026-02-01&to=2026-02-27&location_id=<UUID>"

# Beispiel: 5-Minuten-Leistungswerte
curl -H "Authorization: Bearer <API_KEY>" \\
  "${endpoint || "<ENDPOINT>"}?action=get-readings&from=2026-02-26T00:00:00Z&to=2026-02-27T00:00:00Z&meter_ids=<UUID1>,<UUID2>"

# Beispiel: Messwerte pushen
curl -X POST -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"readings":[{"meter_id":"...","tenant_id":"...","power_value":42.5,"energy_type":"strom"}]}' \\
  "${endpoint || "<ENDPOINT>"}"
`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
