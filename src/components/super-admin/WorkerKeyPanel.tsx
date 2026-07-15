import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Copy, RefreshCw, KeyRound, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface WorkerKeyInfo {
  success: boolean;
  is_set: boolean;
  key: string;
  length: number;
  environment: string;
}

function generateWorkerKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `aic_worker_${hex}`;
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} in Zwischenablage kopiert`);
  } catch {
    toast.error("Kopieren fehlgeschlagen");
  }
}

export default function WorkerKeyPanel() {
  const [reveal, setReveal] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<WorkerKeyInfo>({
    queryKey: ["worker-key-info"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("worker-key-info");
      if (error) throw error;
      return data as WorkerKeyInfo;
    },
    refetchOnWindowFocus: false,
  });

  const handleGenerate = () => {
    const next = generateWorkerKey();
    setGenerated(next);
    toast.success("Neuer Worker-Key generiert (nur lokal — noch nicht aktiv)");
  };

  const cloudKey = data?.key ?? "";
  const cloudMasked = cloudKey ? `${cloudKey.slice(0, 12)}${"•".repeat(Math.max(0, cloudKey.length - 16))}${cloudKey.slice(-4)}` : "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Aktueller GATEWAY_API_KEY (Lovable Cloud)
          </CardTitle>
          <CardDescription>
            Wert der Cloud-Instanz — nur für Super-Admins sichtbar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Lade Key-Status…
            </div>
          )}
          {isError && (
            <Alert variant="destructive">
              <AlertDescription>{(error as Error)?.message ?? "Fehler beim Laden"}</AlertDescription>
            </Alert>
          )}
          {data && (
            <>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Status:</span>
                {data.is_set ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-700">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Gesetzt ({data.length} Zeichen)
                  </Badge>
                ) : (
                  <Badge variant="destructive">Nicht gesetzt</Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                  Aktualisieren
                </Button>
              </div>

              {data.is_set && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    {reveal ? "Klartext-Key:" : "Maskiert:"}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={reveal ? cloudKey : cloudMasked}
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={() => setReveal((r) => !r)} title={reveal ? "Verbergen" : "Anzeigen"}>
                      {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(cloudKey, "Cloud-Key")} title="Kopieren">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Neuen Worker-Key generieren
          </CardTitle>
          <CardDescription>
            Erzeugt einen kryptografisch zufälligen Key (Format <code>aic_worker_&lt;48 hex&gt;</code>).
            Der Key wird <strong>nirgendwo automatisch gesetzt</strong> — Rollout siehe Anleitung unten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGenerate} variant="default">
            <KeyRound className="h-4 w-4 mr-2" />
            Neuen Worker-Key generieren
          </Button>

          {generated && (
            <div className="space-y-3 border rounded-md p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Neuer Key (bitte jetzt kopieren):</label>
                <Badge variant="outline" className="text-xs">nur lokal, nicht aktiv</Badge>
              </div>
              <div className="flex gap-2">
                <Input readOnly value={generated} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(generated, "Neuer Key")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <Alert>
                <AlertTitle>Rollout auf Hetzner</AlertTitle>
                <AlertDescription>
                  <ol className="list-decimal list-inside space-y-1 mt-2 text-xs">
                    <li>Auf Hetzner-Host: <code>cd supabase-docker</code></li>
                    <li>
                      In <code>.env</code> Zeile ersetzen:{" "}
                      <code className="break-all">GATEWAY_API_KEY={generated.slice(0, 20)}…</code>
                    </li>
                    <li>Edge Functions neu starten: <code>docker compose restart functions</code></li>
                    <li>
                      Auf <strong>jedem</strong> Bridge-Worker (loxone-ws-worker etc.) den Key in dessen
                      <code>.env</code> ersetzen und <code>docker compose restart</code> ausführen.
                    </li>
                    <li>
                      Kontrolle: Bridge-Push muss weiterhin HTTP 200 auf <code>/gateway-ingest</code> liefern.
                    </li>
                  </ol>
                  <p className="mt-2 text-xs text-destructive">
                    Alle Bridges müssen den neuen Key gleichzeitig kennen, sonst brechen Pushes weg.
                  </p>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
