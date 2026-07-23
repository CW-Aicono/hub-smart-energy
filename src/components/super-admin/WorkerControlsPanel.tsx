import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, PauseCircle, PlayCircle, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkerControls, WorkerControl } from "@/hooks/useWorkerControls";
import { useSystemSetting, useSetSystemSetting } from "@/hooks/useSystemSetting";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "Europe/Berlin",
    });
  } catch {
    return iso;
  }
}

function WorkerRow({ w, onToggle }: { w: WorkerControl; onToggle: (next: boolean, note: string) => void }) {
  const [note, setNote] = useState(w.note ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);

  const askToggle = (next: boolean) => {
    setPendingValue(next);
    setDialogOpen(true);
  };

  const confirm = () => {
    if (pendingValue === null) return;
    onToggle(pendingValue, note);
    setDialogOpen(false);
    setPendingValue(null);
  };

  return (
    <Card className="border-l-4" style={{ borderLeftColor: w.enabled ? "hsl(152 55% 42%)" : "hsl(0 70% 55%)" }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              {w.display_name}
              {w.enabled ? (
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                  <PlayCircle className="w-3 h-3 mr-1" />
                  Aktiv
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <PauseCircle className="w-3 h-3 mr-1" />
                  Pausiert
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              <code className="text-xs">{w.worker_key}</code>
              {w.description && <div className="mt-1">{w.description}</div>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={w.enabled}
              onCheckedChange={(v) => askToggle(v)}
              aria-label={`Toggle ${w.display_name}`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div>Pausiert seit:</div>
          <div className="text-foreground">{formatDate(w.paused_at)}</div>
          <div>Zuletzt geändert:</div>
          <div className="text-foreground">{formatDate(w.updated_at)}</div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Notiz (optional)</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. 'Test-Pause für IO-Messung 20.06.'"
            rows={2}
            className="mt-1"
          />
        </div>
      </CardContent>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingValue ? "Worker aktivieren?" : "Worker pausieren?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingValue
                ? `"${w.display_name}" wird ab sofort wieder ausgeführt. Bei Cron-Workern greift die Änderung beim nächsten Cron-Lauf (≤1 Min). Der Loxone-WS-Worker auf Hetzner reagiert innerhalb von 30 Sekunden.`
                : `"${w.display_name}" wird gestoppt. Cron-Worker antworten ab dem nächsten Lauf sofort mit "skipped" und führen keine DB-Schreibvorgänge mehr aus. Der Loxone-WS-Worker auf Hetzner trennt seine WebSocket-Verbindungen innerhalb von 30 Sekunden. Bestehende Daten bleiben unverändert.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirm}
              className={pendingValue ? "" : "bg-destructive hover:bg-destructive/90"}
            >
              {pendingValue ? "Aktivieren" : "Pausieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function WorkerControlsPanel() {
  const { data, isLoading, isError, error, setEnabled } = useWorkerControls();

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Wichtig zur IO-Messung</AlertTitle>
        <AlertDescription>
          Das IO-Budget in Lovable Cloud ist ein <strong>rollierender 24-Stunden-Durchschnitt</strong>.
          Nach einer Pause werden erste Verbesserungen frühestens nach <strong>~6 Stunden</strong> sichtbar,
          der volle Effekt erst nach <strong>24 Stunden</strong>. Live-Werte sind nicht aussagekräftig.
        </AlertDescription>
      </Alert>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Lade Worker-Status …
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden</AlertTitle>
          <AlertDescription>{(error as Error)?.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((w) => (
          <WorkerRow
            key={w.worker_key}
            w={w}
            onToggle={(next, note) =>
              setEnabled.mutate({ worker_key: w.worker_key, enabled: next, note })
            }
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hinweise</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Cron-Worker</strong> (Loxone/Shelly/Gateway/Brighthub Periodic Sync): Der Cron-Job läuft
            weiter, die Edge-Function antwortet im pausierten Zustand sofort mit{" "}
            <code>{`{ skipped: true }`}</code> — keine externe API-Calls, keine DB-Schreibvorgänge.
          </p>
          <p>
            <strong>Loxone WS Worker (Hetzner):</strong> Der Container läuft weiter, pollt diese Tabelle alle
            30 Sekunden. Im pausierten Zustand werden alle WebSocket-Verbindungen sauber getrennt und keine
            Messwerte mehr geschrieben.
          </p>
          <p>
            <strong>Standard:</strong> Alle Worker sind <em>aktiv</em>. Beim Neustart eines Workers bleibt
            der gespeicherte Status erhalten — ein pausierter Worker bleibt auch nach Neustart pausiert.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
