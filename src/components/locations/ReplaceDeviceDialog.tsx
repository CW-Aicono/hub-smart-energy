import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { useQueryClient } from "@tanstack/react-query";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";
import { invokeWithRetry } from "@/lib/invokeWithRetry";
import type { Meter } from "@/hooks/useMeters";
import type { Database } from "@/integrations/supabase/types";

type MeterInsertDB = Database["public"]["Tables"]["meters"]["Insert"];

interface SensorOption {
  uuid: string;
  name: string;
}

interface ReplaceDeviceDialogProps {
  meter: Meter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful swap so parent dialog can close/refresh. */
  onReplaced?: () => void;
}

type SwapMode = "in_place" | "audit";

/**
 * Stage 2 of the device replacement plan: swap a defective device against a new one.
 *
 * Two modes:
 *  - in_place: same meters.id, only sensor_uuid / location_integration_id change.
 *              History (5min, daily totals, automation) stays attached to this meter.
 *  - audit:    create a NEW meter row with `replaces_meter_id` pointing to the old one,
 *              archive the old row. Historical data stays attached to the old meter.
 *
 * In both modes, an optional starting offset (current reading of the new device) can
 * be entered. The offset is stored on the meter that will receive future readings.
 */
export function ReplaceDeviceDialog({ meter, open, onOpenChange, onReplaced }: ReplaceDeviceDialogProps) {
  const queryClient = useQueryClient();
  const { locationIntegrations, loading: integrationsLoading } = useLocationIntegrations(meter.location_id ?? undefined);
  const enabledIntegrations = locationIntegrations.filter((li) => li.is_enabled);

  const isMeter = (meter as any).device_type !== "sensor" && (meter as any).device_type !== "actuator";

  const [mode, setMode] = useState<SwapMode>("in_place");
  const [selectedIntegration, setSelectedIntegration] = useState(meter.location_integration_id || "");
  const [selectedSensor, setSelectedSensor] = useState("");
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [offsetValue, setOffsetValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset when dialog re-opens
  useEffect(() => {
    if (!open) return;
    setMode("in_place");
    setSelectedIntegration(meter.location_integration_id || "");
    setSelectedSensor("");
    setOffsetValue("");
    setNote("");
  }, [open, meter.id, meter.location_integration_id]);

  // Fetch sensors for the selected gateway
  useEffect(() => {
    if (!open || !selectedIntegration) {
      setSensors([]);
      return;
    }
    const li = enabledIntegrations.find((i) => i.id === selectedIntegration);
    if (!li) return;

    let cancelled = false;
    const fetchSensors = async () => {
      setSensorsLoading(true);
      try {
        const integrationType = li.integration?.type || "";
        const edgeFunction = getEdgeFunctionName(integrationType);
        const { data, error } = await invokeWithRetry(edgeFunction, {
          body: { locationIntegrationId: li.id, action: "getSensors" },
        });
        if (cancelled) return;
        if (error || !data?.sensors) {
          // Loxone fallback via "structure"
          if (integrationType === "loxone_miniserver") {
            const { data: structData, error: structErr } = await invokeWithRetry(edgeFunction, {
              body: { action: "structure", config: li.config },
            });
            if (cancelled) return;
            if (!structErr && structData?.controls) {
              const list: SensorOption[] = [];
              const controls = structData.controls as Record<string, { name: string; uuidAction: string }>;
              Object.values(controls).forEach((ctrl) => {
                if (ctrl.name && ctrl.uuidAction) list.push({ uuid: ctrl.uuidAction, name: ctrl.name });
              });
              setSensors(list.sort((a, b) => a.name.localeCompare(b.name)));
              return;
            }
          }
          setSensors([]);
        } else {
          const list: SensorOption[] = (data.sensors as any[]).map((s) => ({ uuid: s.id, name: s.name }));
          setSensors(list.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        if (!cancelled) setSensors([]);
      } finally {
        if (!cancelled) setSensorsLoading(false);
      }
    };
    fetchSensors();
    return () => {
      cancelled = true;
    };
  }, [open, selectedIntegration]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["meters"] });
  };

  const parseOffset = (): number => {
    if (!isMeter) return 0;
    const trimmed = offsetValue.trim();
    if (!trimmed) return 0;
    const parsed = parseFloat(trimmed.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleSubmit = async () => {
    if (!selectedIntegration || !selectedSensor) {
      toast.error("Bitte Gateway und Sensor des neuen Geräts auswählen");
      return;
    }
    setSaving(true);
    try {
      const offsetNum = parseOffset();
      const noteText = note.trim() || null;
      const nowIso = new Date().toISOString();

      if (mode === "in_place") {
        // Simply rewire the existing meter row to the new sensor/gateway.
        const updates: Partial<MeterInsertDB> = {
          location_integration_id: selectedIntegration,
          sensor_uuid: selectedSensor,
        };
        if (isMeter) {
          updates.meter_offset_kwh = offsetNum;
          updates.meter_offset_reason = offsetNum !== 0 ? "device_replacement" : null;
          updates.meter_offset_note = offsetNum !== 0 ? noteText : null;
          updates.meter_offset_set_at = offsetNum !== 0 ? nowIso : null;
        }
        const { error } = await supabase.from("meters").update(updates).eq("id", meter.id);
        if (error) throw error;
        toast.success("Gerät erfolgreich getauscht – Historie bleibt erhalten");
      } else {
        // Audit mode: create a NEW meter row, archive the old one.
        const m: any = meter;
        const insert: MeterInsertDB = {
          tenant_id: meter.tenant_id,
          location_id: meter.location_id,
          name: meter.name,
          energy_type: meter.energy_type,
          unit: meter.unit,
          medium: meter.medium,
          capture_type: meter.capture_type ?? "automatic",
          location_integration_id: selectedIntegration,
          sensor_uuid: selectedSensor,
          device_type: m.device_type ?? "meter",
          meter_number: meter.meter_number,
          meter_operator: m.meter_operator,
          parent_meter_id: meter.parent_meter_id,
          is_main_meter: meter.is_main_meter,
          is_bidirectional: m.is_bidirectional ?? false,
          meter_function: meter.meter_function ?? "consumption",
          floor_id: meter.floor_id,
          room_id: meter.room_id,
          installation_date: new Date().toISOString().slice(0, 10),
          source_unit_power: m.source_unit_power,
          source_unit_energy: m.source_unit_energy,
          gas_type: m.gas_type,
          zustandszahl: m.zustandszahl,
          brennwert: m.brennwert,
          replaces_meter_id: meter.id,
          ...(isMeter
            ? {
                meter_offset_kwh: offsetNum,
                meter_offset_reason: offsetNum !== 0 ? "device_replacement" : null,
                meter_offset_note: offsetNum !== 0 ? noteText : null,
                meter_offset_set_at: offsetNum !== 0 ? nowIso : null,
              }
            : {}),
        };

        const { data: created, error: insertErr } = await supabase
          .from("meters")
          .insert(insert)
          .select("id")
          .single();
        if (insertErr) throw insertErr;

        // Archive the old meter and detach its physical wiring so it stops ingesting.
        const { error: archiveErr } = await supabase
          .from("meters")
          .update({
            is_archived: true,
            sensor_uuid: null,
            location_integration_id: null,
            notes: [meter.notes, `Ersetzt am ${nowIso.slice(0, 10)} durch neuen Datensatz${created?.id ? ` (${created.id})` : ""}${noteText ? ` – ${noteText}` : ""}`]
              .filter(Boolean)
              .join("\n"),
          })
          .eq("id", meter.id);
        if (archiveErr) throw archiveErr;

        toast.success("Neuer Zähler angelegt – alter wurde archiviert");
      }

      invalidate();
      onReplaced?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error("[ReplaceDeviceDialog] swap failed", e);
      toast.error(e?.message || "Gerätetausch fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Gerät tauschen – {meter.name}
          </DialogTitle>
          <DialogDescription>
            Ersatz eines defekten Geräts gegen ein neues. Wählen Sie den passenden Modus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div className="space-y-2 rounded-md border p-3 bg-muted/30">
            <Label className="text-sm font-medium">Modus *</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as SwapMode)} className="space-y-2">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="in_place" id="swap-in-place" className="mt-0.5" />
                <Label htmlFor="swap-in-place" className="font-normal cursor-pointer">
                  <span className="font-medium">Im selben Datensatz weiterführen</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Empfohlen. Historische Daten, Automationen und Übergeordneter Zähler bleiben unverändert.
                    Nur Sensor/Gateway wird neu verdrahtet.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="audit" id="swap-audit" className="mt-0.5" />
                <Label htmlFor="swap-audit" className="font-normal cursor-pointer">
                  <span className="font-medium">Neuen Zähler anlegen (Audit-Trennung)</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Neuer Datensatz mit Verweis auf den alten ({"replaces_meter_id"}). Alter Datensatz wird
                    archiviert. Historie bleibt am alten, neue Daten am neuen Zähler. Für rechtssichere Trennung.
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Neues Gerät</p>
            <div>
              <Label>Datengateway *</Label>
              {integrationsLoading ? (
                <Skeleton className="h-9 w-full mt-1" />
              ) : enabledIntegrations.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <AlertCircle className="h-4 w-4" />
                  <span>Kein aktives Gateway konfiguriert.</span>
                </div>
              ) : (
                <Select value={selectedIntegration} onValueChange={(v) => { setSelectedIntegration(v); setSelectedSensor(""); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Gateway auswählen" /></SelectTrigger>
                  <SelectContent>
                    {enabledIntegrations.map((li) => (
                      <SelectItem key={li.id} value={li.id}>{li.integration?.name || "Gateway"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {selectedIntegration && (
              <div>
                <Label>Sensor / Kanal des neuen Geräts *</Label>
                {sensorsLoading ? (
                  <Skeleton className="h-9 w-full mt-1" />
                ) : sensors.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">Keine Sensoren gefunden.</p>
                ) : (
                  <Select value={selectedSensor} onValueChange={setSelectedSensor}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Sensor auswählen" /></SelectTrigger>
                    <SelectContent>
                      {sensors.map((s) => (
                        <SelectItem key={s.uuid} value={s.uuid}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          {isMeter && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Anfangsbestand des neuen Geräts (optional)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Falls das neue Gerät bereits einen Zählerstand mitbringt, hier eintragen.
                  Wird als Offset auf zukünftige Messwerte addiert. Verbrauchsdifferenzen bleiben unberührt.
                </p>
              </div>
              <div>
                <Label>Aktueller Zählerstand ({meter.unit || "kWh"})</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={offsetValue}
                  onChange={(e) => setOffsetValue(e.target.value)}
                  placeholder="z. B. 145823,5"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <div>
            <Label>Notiz zum Tausch (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="z. B. Defekt am 16.05.2026, Garantietausch, Seriennummer XYZ"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !selectedIntegration || !selectedSensor}
            className="gap-1.5"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            {saving ? "Tausche…" : "Tausch durchführen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
