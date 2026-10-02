import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRightLeft, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useLocationIntegrations, type LocationIntegration } from "@/hooks/useIntegrations";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";
import { invokeWithRetry } from "@/lib/invokeWithRetry";

interface ReplaceGatewayDialogProps {
  oldGateway: LocationIntegration;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplaced?: () => void;
}

type SwapMode = "takeover" | "manual" | "discard";

interface MeterRow {
  id: string;
  name: string;
  sensor_uuid: string | null;
  device_type: string | null;
  energy_type: string;
}

interface SensorOption {
  uuid: string;
  name: string;
}

/**
 * Stage 3 of the device replacement plan: swap an entire gateway.
 *
 * Three modes:
 *  - takeover: rewire all linked meters to the new gateway. Sensor-UUIDs are kept
 *              by default; optional name-based remapping fetches the new gateway's
 *              sensor list and matches by exact name.
 *  - manual:   detach all meters (clear location_integration_id + sensor_uuid),
 *              disable old gateway. User reassigns sensors via SensorsDialog.
 *  - discard:  archive all meters of the old gateway and disable it. Fresh start.
 */
export function ReplaceGatewayDialog({ oldGateway, open, onOpenChange, onReplaced }: ReplaceGatewayDialogProps) {
  const queryClient = useQueryClient();
  const { locationIntegrations, loading: integrationsLoading } = useLocationIntegrations(oldGateway.location_id);
  const candidates = locationIntegrations.filter((li) => li.id !== oldGateway.id && li.is_enabled);

  const [mode, setMode] = useState<SwapMode>("takeover");
  const [newGatewayId, setNewGatewayId] = useState("");
  const [remapByName, setRemapByName] = useState(true);
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [metersLoading, setMetersLoading] = useState(false);
  const [newSensors, setNewSensors] = useState<SensorOption[] | null>(null);
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset & load
  useEffect(() => {
    if (!open) return;
    setMode("takeover");
    setNewGatewayId("");
    setRemapByName(true);
    setNote("");
    setNewSensors(null);

    (async () => {
      setMetersLoading(true);
      const { data, error } = await supabase
        .from("meters")
        .select("id, name, sensor_uuid, device_type, energy_type")
        .eq("location_integration_id", oldGateway.id)
        .eq("is_archived", false);
      if (error) {
        console.error("[ReplaceGatewayDialog] meters fetch", error);
        setMeters([]);
      } else {
        setMeters((data as MeterRow[]) ?? []);
      }
      setMetersLoading(false);
    })();
  }, [open, oldGateway.id]);

  // Load sensors of new gateway when needed for name remap
  useEffect(() => {
    if (!open || mode !== "takeover" || !remapByName || !newGatewayId) {
      setNewSensors(null);
      return;
    }
    const target = candidates.find((c) => c.id === newGatewayId);
    if (!target) return;

    let cancelled = false;
    (async () => {
      setSensorsLoading(true);
      try {
        const integrationType = target.integration?.type || "";
        const edgeFunction = getEdgeFunctionName(integrationType);
        const { data, error } = await invokeWithRetry(edgeFunction, {
          body: { locationIntegrationId: target.id, action: "getSensors" },
        });
        if (cancelled) return;
        if (error || !data?.sensors) {
          if (integrationType === "loxone_miniserver") {
            const { data: structData, error: structErr } = await invokeWithRetry(edgeFunction, {
              body: { action: "structure", config: target.config },
            });
            if (cancelled) return;
            if (!structErr && structData?.controls) {
              const list: SensorOption[] = [];
              const controls = structData.controls as Record<string, { name: string; uuidAction: string }>;
              Object.values(controls).forEach((ctrl) => {
                if (ctrl.name && ctrl.uuidAction) list.push({ uuid: ctrl.uuidAction, name: ctrl.name });
              });
              setNewSensors(list);
              return;
            }
          }
          setNewSensors([]);
        } else {
          setNewSensors((data.sensors as any[]).map((s) => ({ uuid: s.id, name: s.name })));
        }
      } catch (e) {
        if (!cancelled) setNewSensors([]);
      } finally {
        if (!cancelled) setSensorsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, remapByName, newGatewayId]);

  // Build a remap preview: meter.name → matched new sensor uuid (case-insensitive exact)
  const remapPreview = (() => {
    if (mode !== "takeover" || !remapByName || !newSensors) return null;
    const byName = new Map(newSensors.map((s) => [s.name.trim().toLowerCase(), s.uuid]));
    let matched = 0;
    let kept = 0;
    for (const m of meters) {
      const key = m.name.trim().toLowerCase();
      if (byName.has(key)) matched++;
      else if (m.sensor_uuid) kept++;
    }
    return { matched, kept, unmapped: meters.length - matched - kept, total: meters.length };
  })();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["meters"] });
    queryClient.invalidateQueries({ queryKey: ["locationIntegrations"] });
    queryClient.invalidateQueries({ queryKey: ["location_integrations"] });
  };

  const handleSubmit = async () => {
    if (mode === "takeover" && !newGatewayId) {
      toast.error("Bitte neues Gateway auswählen");
      return;
    }
    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const noteText = note.trim();

      if (mode === "takeover") {
        // Determine per-meter sensor_uuid: name-match if available, otherwise keep old.
        const byName = remapByName && newSensors
          ? new Map(newSensors.map((s) => [s.name.trim().toLowerCase(), s.uuid]))
          : null;

        for (const m of meters) {
          const matched = byName?.get(m.name.trim().toLowerCase());
          const newSensorUuid = matched ?? m.sensor_uuid;
          const { error } = await supabase
            .from("meters")
            .update({
              location_integration_id: newGatewayId,
              sensor_uuid: newSensorUuid,
            })
            .eq("id", m.id);
          if (error) throw error;
        }

        // Disable old gateway (don't delete, keep for audit)
        const { error: disErr } = await supabase
          .from("location_integrations")
          .update({ is_enabled: false })
          .eq("id", oldGateway.id);
        if (disErr) throw disErr;

        toast.success(`${meters.length} Geräte auf neues Gateway übertragen`);
      } else if (mode === "manual") {
        // Detach meters from old gateway, keep them as manual/unassigned
        if (meters.length > 0) {
          const ids = meters.map((m) => m.id);
          const { error } = await supabase
            .from("meters")
            .update({
              location_integration_id: null,
              sensor_uuid: null,
              capture_type: "manual",
            })
            .in("id", ids);
          if (error) throw error;
        }
        const { error: disErr } = await supabase
          .from("location_integrations")
          .update({ is_enabled: false })
          .eq("id", oldGateway.id);
        if (disErr) throw disErr;

        toast.success(`${meters.length} Geräte abgekoppelt – jetzt manuell neu zuordnen`);
      } else {
        // discard: archive all old meters + disable old gateway
        if (meters.length > 0) {
          const ids = meters.map((m) => m.id);
          const archiveNote = `Verworfen beim Gateway-Tausch am ${nowIso.slice(0, 10)}${noteText ? ` – ${noteText}` : ""}`;
          const { error } = await supabase
            .from("meters")
            .update({
              is_archived: true,
              sensor_uuid: null,
              location_integration_id: null,
              notes: archiveNote,
            })
            .in("id", ids);
          if (error) throw error;
        }
        const { error: disErr } = await supabase
          .from("location_integrations")
          .update({ is_enabled: false })
          .eq("id", oldGateway.id);
        if (disErr) throw disErr;

        toast.success(`${meters.length} Geräte archiviert – neues Gateway startet leer`);
      }

      invalidate();
      onReplaced?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error("[ReplaceGatewayDialog] swap failed", e);
      toast.error(e?.message || "Gateway-Tausch fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  };

  const oldName = oldGateway.integration?.name || "Gateway";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Gateway tauschen – {oldName}
          </DialogTitle>
          <DialogDescription>
            Defektes oder ausgetauschtes Gateway durch ein neues ersetzen. Wählen Sie, was mit den
            zugeordneten Geräten passieren soll.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          {/* Linked devices overview */}
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Aktuell verknüpfte Geräte am alten Gateway</p>
              {metersLoading ? (
                <Skeleton className="h-5 w-12" />
              ) : (
                <Badge variant="outline">{meters.length}</Badge>
              )}
            </div>
            {metersLoading ? (
              <Skeleton className="h-16 w-full mt-2" />
            ) : meters.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">Keine Geräte am alten Gateway zugeordnet.</p>
            ) : (
              <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-1">
                {meters.slice(0, 10).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{m.name}</span>
                    <span className="font-mono opacity-60 shrink-0">{m.sensor_uuid?.slice(0, 8) ?? "—"}</span>
                  </li>
                ))}
                {meters.length > 10 && <li className="opacity-70">… und {meters.length - 10} weitere</li>}
              </ul>
            )}
          </div>

          {/* Mode selector */}
          <div className="rounded-md border p-3 bg-muted/30 space-y-2">
            <Label className="text-sm font-medium">Modus *</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as SwapMode)} className="space-y-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="takeover" id="gw-takeover" className="mt-0.5" />
                <Label htmlFor="gw-takeover" className="font-normal cursor-pointer">
                  <span className="font-medium">Alle Geräte 1:1 übernehmen</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Empfohlen. Alle Geräte werden auf das neue Gateway verlegt, Historie und
                    Automationen bleiben erhalten.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="manual" id="gw-manual" className="mt-0.5" />
                <Label htmlFor="gw-manual" className="font-normal cursor-pointer">
                  <span className="font-medium">Manuell neu zuordnen</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Geräte bleiben erhalten, werden aber vom Gateway abgekoppelt
                    (Erfassung wird auf „manuell" gesetzt). Sie ordnen sie später wieder zu.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="discard" id="gw-discard" className="mt-0.5" />
                <Label htmlFor="gw-discard" className="font-normal cursor-pointer">
                  <span className="font-medium">Alle Geräte verwerfen (archivieren)</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Neustart: alte Geräte werden archiviert, neues Gateway beginnt mit leerer Liste.
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Takeover details */}
          {mode === "takeover" && (
            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Neues Gateway</p>
              {integrationsLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : candidates.length === 0 ? (
                <div className="flex items-start gap-2 text-sm rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <span>
                    Kein anderes aktives Gateway an dieser Liegenschaft gefunden.
                    Bitte zuerst neues Gateway hinzufügen und aktivieren, dann erneut tauschen.
                  </span>
                </div>
              ) : (
                <Select value={newGatewayId} onValueChange={setNewGatewayId}>
                  <SelectTrigger><SelectValue placeholder="Neues Gateway auswählen" /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.integration?.name || "Gateway"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex items-start gap-2 pt-1">
                <input
                  id="gw-remap"
                  type="checkbox"
                  checked={remapByName}
                  onChange={(e) => setRemapByName(e.target.checked)}
                  className="mt-1"
                />
                <Label htmlFor="gw-remap" className="font-normal cursor-pointer">
                  <span className="text-sm">Sensor-UUIDs automatisch über Namen neu zuordnen</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Empfehlenswert, wenn das neue Gateway dasselbe Setup repliziert, die internen
                    Sensor-IDs sich aber geändert haben. Bei abweichenden Namen bleibt die alte UUID stehen –
                    diese Geräte müssen Sie später manuell neu zuordnen.
                  </span>
                </Label>
              </div>

              {remapByName && newGatewayId && (
                <div className="rounded-md border p-2 bg-muted/30 text-xs">
                  {sensorsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Sensoren des neuen Gateways werden geladen…
                    </div>
                  ) : !remapPreview ? (
                    <span className="text-muted-foreground">Keine Vorschau verfügbar.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 text-primary">
                        <CheckCircle2 className="h-3 w-3" /> {remapPreview.matched} per Namen gemappt
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{remapPreview.kept} mit alter UUID</span>
                      {remapPreview.unmapped > 0 && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-destructive">{remapPreview.unmapped} ohne Zuordnung</span>
                        </>
                      )}
                      <span className="text-muted-foreground">von {remapPreview.total}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Discard warning */}
          {mode === "discard" && meters.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Achtung – {meters.length} Geräte werden archiviert</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Historische Messwerte bleiben in der Datenbank erhalten, die Geräte werden aber
                  ausgeblendet und nicht mehr eingelesen. Sie können sie später unter
                  „Archivierte Zähler" wiederherstellen.
                </p>
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <Label>Notiz zum Tausch (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="z. B. Garantietausch nach Defekt, neue Hardware-Generation"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              metersLoading ||
              (mode === "takeover" && (!newGatewayId || candidates.length === 0))
            }
            className="gap-1.5"
            variant={mode === "discard" ? "destructive" : "default"}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            {submitting ? "Tausche…" : "Tausch durchführen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
