import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, Check, KeyRound, Plus, Trash2, AlertTriangle } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { toast } from "sonner";

interface TenantKey {
  id: string;
  key_prefix: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function ApiSettings() {
  const { tenant } = useTenant();
  const { t } = useTranslation();

  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [keys, setKeys] = useState<TenantKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<TenantKey | null>(null);

  const loadEndpoint = async () => {
    const { data, error } = await supabase.functions.invoke("api-key-info");
    if (!error && data?.endpoint) setEndpoint(data.endpoint);
  };

  const loadKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("tenant-api-key-list");
    if (error) {
      console.error("tenant-api-key-list error:", error);
      toast.error(t("api.fetchError"));
    } else {
      setKeys(data?.keys ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEndpoint();
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(t("api.copied"));
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const createKey = async () => {
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("tenant-api-key-create", {
      body: { label: newLabel || "default" },
    });
    setCreating(false);
    if (error || !data?.key) {
      toast.error("Fehler beim Erzeugen des Keys");
      return;
    }
    setFreshKey(data.key);
    setNewLabel("");
    setCreateOpen(false);
    loadKeys();
  };

  const doRevoke = async () => {
    if (!revokeTarget) return;
    const { error } = await supabase.functions.invoke("tenant-api-key-revoke", {
      body: { key_id: revokeTarget.id },
    });
    if (error) {
      toast.error("Fehler beim Widerrufen");
    } else {
      toast.success("Key widerrufen");
      loadKeys();
    }
    setRevokeTarget(null);
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE") : "–");

  return (
    <div className="space-y-6">
      {/* Endpoint + Tenant-ID */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            API-Zugangsdaten <HelpTooltip text="Endpoint und Tenant-ID für externe Systeme" />
          </CardTitle>
          <CardDescription>Endpoint und Tenant-ID für externe Systeme zum Kopieren</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API-Endpoint</Label>
            <div className="flex gap-2">
              <Input readOnly value={endpoint || "..."} className="font-mono text-sm bg-muted" />
              {endpoint && (
                <Button variant="outline" size="icon" onClick={() => copy(endpoint, "endpoint")}>
                  {copiedField === "endpoint" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tenant-ID</Label>
            <div className="flex gap-2">
              <Input readOnly value={tenant?.id || "..."} className="font-mono text-sm bg-muted" />
              {tenant?.id && (
                <Button variant="outline" size="icon" onClick={() => copy(tenant.id, "tid")}>
                  {copiedField === "tid" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Wird z.B. für die Schneider Panel Server HTTPS-Publikation als Query-Parameter benötigt.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* API-Keys Verwaltung */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> API-Keys
            </CardTitle>
            <CardDescription>
              Erzeugen Sie tenant-eigene API-Keys für externe Push-Integrationen. Der Klartext-Key
              wird nur ein einziges Mal bei der Erzeugung angezeigt.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Neuen Key erzeugen
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Lade…</p>
          ) : keys.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Noch keine API-Keys erzeugt.
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-3 font-medium">Bezeichnung</th>
                    <th className="p-3 font-medium">Prefix</th>
                    <th className="p-3 font-medium">Erstellt</th>
                    <th className="p-3 font-medium">Zuletzt genutzt</th>
                    <th className="p-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b last:border-0">
                      <td className="p-3">{k.label}</td>
                      <td className="p-3 font-mono text-xs">
                        <Badge variant="secondary">{k.key_prefix}…</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{fmt(k.created_at)}</td>
                      <td className="p-3 text-muted-foreground">{fmt(k.last_used_at)}</td>
                      <td className="p-3">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => setRevokeTarget(k)}
                          aria-label="Key widerrufen"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage hint */}
      <Card>
        <CardHeader>
          <CardTitle>Beispiel-Aufruf</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`# Messwerte pushen (mit tenant-eigenem Key)
curl -X POST -H "Authorization: Bearer aic_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"readings":[{"meter_id":"...","tenant_id":"${tenant?.id ?? "<TENANT_ID>"}","power_value":42.5,"energy_type":"strom"}]}' \\
  "${endpoint || "<ENDPOINT>"}"`}
          </pre>
        </CardContent>
      </Card>

      {/* Neuer-Key-Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen API-Key erzeugen</DialogTitle>
            <DialogDescription>
              Geben Sie eine Bezeichnung an, damit Sie später erkennen, wofür der Key verwendet wird.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="label">Bezeichnung</Label>
            <Input
              id="label" value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="z.B. Schneider Panel Server – Standort München"
              maxLength={64}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={createKey} disabled={creating}>
              {creating ? "Erzeuge…" : "Erzeugen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Klartext-Key-Anzeige (einmalig) */}
      <Dialog open={!!freshKey} onOpenChange={(o) => !o && setFreshKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Neuer API-Key erzeugt
            </DialogTitle>
            <DialogDescription>
              <strong>Dieser Key wird nur ein einziges Mal angezeigt.</strong> Bitte jetzt kopieren
              und sicher aufbewahren. Er kann später nicht mehr eingesehen werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="flex gap-2">
              <Input readOnly value={freshKey || ""} className="font-mono text-sm" />
              <Button
                variant="outline" size="icon"
                onClick={() => freshKey && copy(freshKey, "fresh")}
              >
                {copiedField === "fresh" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setFreshKey(null)}>Ich habe den Key gespeichert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke-Bestätigung */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>API-Key widerrufen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Key „{revokeTarget?.label}" ({revokeTarget?.key_prefix}…) wird sofort ungültig.
              Externe Systeme, die diesen Key nutzen, können nicht mehr pushen. Dies kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={doRevoke}>Widerrufen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
