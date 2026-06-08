import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Download, RefreshCw, ShieldAlert, Upload, X } from "lucide-react";

interface Props {
  chargePointId: string;
  vendor: string | null;
  model: string | null;
  currentFirmwareVersion: string | null;
}

interface ArtifactRow {
  id: string;
  vendor: string;
  model: string;
  version: string;
  file_format: string;
  file_size: number | null;
  release_notes: string | null;
  is_eichrecht_certified: boolean;
  eichrecht_approval_ref: string | null;
}

interface JobRow {
  id: string;
  status: string;
  retrieve_date: string;
  created_at: string;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
  last_status_at: string | null;
  artifact_id: string | null;
  triggered_by: string | null;
  cp_firmware_artifacts: { vendor: string; model: string; version: string } | null;
}

interface EventRow {
  id: string;
  status: string;
  received_at: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  dispatched: "outline",
  downloading: "secondary",
  downloaded: "secondary",
  installing: "secondary",
  installed: "default",
  failed: "destructive",
  cancelled: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "Geplant",
  dispatched: "Befehl gesendet",
  downloading: "Lädt herunter",
  downloaded: "Download fertig",
  installing: "Installiert",
  installed: "Installiert",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};

function ts(s: string | null | undefined) {
  if (!s) return "—";
  try {
    return format(new Date(s), "dd.MM.yyyy HH:mm", { locale: de });
  } catch {
    return s;
  }
}

function nextNight0200(): string {
  const d = new Date();
  d.setHours(2, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export function ChargePointFirmwareCard({ chargePointId, vendor, model, currentFirmwareVersion }: Props) {
  const qc = useQueryClient();
  const [planOpen, setPlanOpen] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>("");
  const [retrieveLocal, setRetrieveLocal] = useState<string>(() => {
    // <input type="datetime-local"> braucht lokale Zeit ohne TZ
    const d = new Date(nextNight0200());
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [eichrechtAck, setEichrechtAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Passende Artefakte (gleicher Vendor + Model)
  const { data: artifacts } = useQuery({
    queryKey: ["cp-firmware-artifacts", vendor, model],
    queryFn: async () => {
      let q = supabase.from("cp_firmware_artifacts").select("*").order("version", { ascending: false });
      if (vendor) q = q.ilike("vendor", vendor);
      if (model) q = q.ilike("model", model);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ArtifactRow[];
    },
  });

  // Jobs für diesen Ladepunkt
  const { data: jobs } = useQuery({
    queryKey: ["cp-firmware-jobs", chargePointId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cp_firmware_jobs")
        .select("*, cp_firmware_artifacts(vendor, model, version)")
        .eq("charge_point_id", chargePointId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as JobRow[];
    },
  });

  const activeJob = useMemo(
    () => jobs?.find((j) => !["installed", "failed", "cancelled"].includes(j.status)) ?? null,
    [jobs],
  );

  // Events für aktiven Job (Live)
  const { data: events } = useQuery({
    queryKey: ["cp-firmware-events", activeJob?.id],
    queryFn: async () => {
      if (!activeJob?.id) return [] as EventRow[];
      const { data, error } = await supabase
        .from("cp_firmware_status_events")
        .select("id, status, received_at")
        .eq("job_id", activeJob.id)
        .order("received_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
    enabled: !!activeJob?.id,
  });

  // Realtime auf Jobs + Events
  useEffect(() => {
    const ch = supabase
      .channel(`cp-firmware-${chargePointId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cp_firmware_jobs", filter: `charge_point_id=eq.${chargePointId}` },
        () => qc.invalidateQueries({ queryKey: ["cp-firmware-jobs", chargePointId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cp_firmware_status_events", filter: `charge_point_id=eq.${chargePointId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["cp-firmware-events"] });
          qc.invalidateQueries({ queryKey: ["cp-firmware-jobs", chargePointId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [chargePointId, qc]);

  const handlePlan = async () => {
    if (!selectedArtifactId) {
      toast({ title: "Bitte Firmware-Version wählen", variant: "destructive" });
      return;
    }
    const artifact = artifacts?.find((a) => a.id === selectedArtifactId);
    if (artifact?.is_eichrecht_certified && !eichrechtAck) {
      toast({ title: "Eichrecht-Bestätigung erforderlich", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const retrieveIso = new Date(retrieveLocal).toISOString();
      const { data, error } = await supabase.functions.invoke("ocpp-firmware-control", {
        body: {
          action: "enqueue_job",
          charge_point_id: chargePointId,
          artifact_id: selectedArtifactId,
          retrieve_date: retrieveIso,
          retries: 3,
          retry_interval: 300,
        },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) throw new Error((data as any).error ?? "Unbekannter Fehler");
      toast({ title: "Update geplant", description: `Für ${ts(retrieveIso)}` });
      setPlanOpen(false);
      setSelectedArtifactId("");
      setEichrechtAck(false);
      qc.invalidateQueries({ queryKey: ["cp-firmware-jobs", chargePointId] });
    } catch (e) {
      toast({ title: "Fehler beim Planen", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("ocpp-firmware-control", {
        body: { action: "cancel_job", job_id: jobId },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) throw new Error((data as any).error ?? "Unbekannter Fehler");
      toast({ title: "Job abgebrochen" });
      qc.invalidateQueries({ queryKey: ["cp-firmware-jobs", chargePointId] });
    } catch (e) {
      toast({ title: "Abbruch fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleRequestStatus = async () => {
    try {
      const { error } = await supabase.functions.invoke("ocpp-firmware-control", {
        body: { action: "request_status", charge_point_id: chargePointId },
      });
      if (error) throw error;
      toast({ title: "Status angefordert" });
    } catch (e) {
      toast({ title: "Status-Abfrage fehlgeschlagen", description: (e as Error).message, variant: "destructive" });
    }
  };

  const matchingNewer = useMemo(() => {
    if (!artifacts || artifacts.length === 0) return null;
    if (!currentFirmwareVersion) return artifacts[0];
    const newer = artifacts.find((a) => a.version.localeCompare(currentFirmwareVersion, undefined, { numeric: true }) > 0);
    return newer ?? null;
  }, [artifacts, currentFirmwareVersion]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Firmware-Update (OCPP)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Hersteller / Modell</div>
            <div className="font-medium">{vendor ?? "—"} {model ?? ""}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Aktuelle Firmware</div>
            <div className="font-medium">{currentFirmwareVersion ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Verfügbares Update</div>
            <div className="font-medium">
              {matchingNewer ? (
                <span className="text-primary">v{matchingNewer.version}</span>
              ) : artifacts && artifacts.length > 0 ? (
                <span className="text-muted-foreground">aktuell</span>
              ) : (
                <span className="text-muted-foreground">keine Pakete im Katalog</span>
              )}
            </div>
          </div>
        </div>

        {/* Eichrecht-Hinweis */}
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Hinweis Eichrecht (§ 40 MessEV)</AlertTitle>
          <AlertDescription className="text-xs">
            Firmware-Updates an eichrechtkonformen Ladepunkten sind genehmigungspflichtig. Verwenden Sie nur
            vom Hersteller freigegebene und im Katalog als „Eichrecht-zertifiziert" markierte Pakete.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Dialog open={planOpen} onOpenChange={setPlanOpen}>
            <DialogTrigger asChild>
              <Button disabled={!artifacts || artifacts.length === 0 || !!activeJob}>
                <Download className="h-4 w-4 mr-2" />
                Update planen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Firmware-Update planen</DialogTitle>
                <DialogDescription>
                  Der Ladepunkt lädt die Datei ab dem gewählten Zeitpunkt selbständig herunter und installiert sie.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Firmware-Version</Label>
                  <Select value={selectedArtifactId} onValueChange={setSelectedArtifactId}>
                    <SelectTrigger><SelectValue placeholder="Version wählen" /></SelectTrigger>
                    <SelectContent>
                      {(artifacts ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          v{a.version} {a.is_eichrecht_certified ? "🛡️ Eichrecht" : ""} ({a.file_format})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Zeitpunkt (Download ab)</Label>
                  <Input
                    type="datetime-local"
                    value={retrieveLocal}
                    onChange={(e) => setRetrieveLocal(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Empfehlung: nachts (Standard 02:00 Uhr), um laufende Ladevorgänge nicht zu unterbrechen.
                  </p>
                </div>

                {(() => {
                  const a = artifacts?.find((x) => x.id === selectedArtifactId);
                  if (!a) return null;
                  return (
                    <>
                      {a.release_notes && (
                        <div className="text-xs bg-muted p-2 rounded">
                          <div className="font-medium mb-1">Release Notes</div>
                          {a.release_notes}
                        </div>
                      )}
                      {a.is_eichrecht_certified && (
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={eichrechtAck}
                            onChange={(e) => setEichrechtAck(e.target.checked)}
                            className="mt-1"
                          />
                          <span>
                            Ich bestätige, dass eine gültige Eichrecht-Konformitätsbescheinigung vorliegt
                            {a.eichrecht_approval_ref ? ` (Ref: ${a.eichrecht_approval_ref})` : ""}.
                          </span>
                        </label>
                      )}
                    </>
                  );
                })()}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPlanOpen(false)}>Abbrechen</Button>
                <Button onClick={handlePlan} disabled={submitting}>
                  {submitting ? "Plane…" : "Update einplanen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {activeJob && (
            <>
              <Button variant="outline" onClick={handleRequestStatus}>
                <RefreshCw className="h-4 w-4 mr-2" /> Status abfragen
              </Button>
              <Button variant="outline" onClick={() => handleCancel(activeJob.id)}>
                <X className="h-4 w-4 mr-2" /> Aktiven Job abbrechen
              </Button>
            </>
          )}
        </div>

        {/* Aktiver Job + Statusverlauf */}
        {activeJob && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">Aktiver Job:</span>{" "}
                v{activeJob.cp_firmware_artifacts?.version ?? "?"} •
                geplant für {ts(activeJob.retrieve_date)}
              </div>
              <Badge variant={STATUS_VARIANT[activeJob.status] ?? "outline"}>
                {STATUS_LABEL[activeJob.status] ?? activeJob.status}
              </Badge>
            </div>
            {events && events.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Statusverlauf:</div>
                {events.map((ev) => (
                  <div key={ev.id} className="text-xs flex justify-between border-b border-border/50 py-1 last:border-0">
                    <span>{ev.status}</span>
                    <span className="text-muted-foreground">{ts(ev.received_at)}</span>
                  </div>
                ))}
              </div>
            )}
            {activeJob.error_message && (
              <div className="text-xs text-destructive flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5" />
                {activeJob.error_message}
              </div>
            )}
          </div>
        )}

        {/* Historie */}
        {jobs && jobs.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-2">Historie</div>
            <div className="space-y-1 text-xs">
              {jobs.filter((j) => j !== activeJob).slice(0, 10).map((j) => (
                <div key={j.id} className="flex items-center justify-between border-b border-border/50 py-1.5">
                  <span>
                    v{j.cp_firmware_artifacts?.version ?? "?"} • {ts(j.created_at)}
                  </span>
                  <Badge variant={STATUS_VARIANT[j.status] ?? "outline"} className="text-xs">
                    {STATUS_LABEL[j.status] ?? j.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ChargePointFirmwareCard;
