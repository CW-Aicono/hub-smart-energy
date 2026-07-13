import { useState, useEffect, useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";
import { invokeWithRetry } from "@/lib/invokeWithRetry";
import { Meter, MeterInsert } from "@/hooks/useMeters";
import { useMeters } from "@/hooks/useMeters";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SOURCE_UNIT_GROUPS, deriveEnergyUnit } from "@/lib/sensorUnits";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Layers, DoorOpen, Upload, Loader2, ImageIcon, ShieldCheck, Flag } from "lucide-react";
import { toast } from "sonner";
import { VirtualMeterFormulaBuilder, VirtualMeterSource } from "./VirtualMeterFormulaBuilder";
import { MeterOffsetSection } from "./MeterOffsetSection";
import { ReplaceDeviceDialog } from "./ReplaceDeviceDialog";
import type { MeterOffsetReason } from "@/lib/meterOffset";
import { ArrowRightLeft } from "lucide-react";
import { useLocationChargePoints } from "@/hooks/useLocationChargePoints";
import { useChargePointGroups } from "@/hooks/useChargePointGroups";

interface Floor {
  id: string;
  name: string;
  floor_number: number;
}

interface Room {
  id: string;
  name: string;
}

interface EditMeterDialogProps {
  meter: Meter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<MeterInsert>) => Promise<void>;
}

interface SensorOption {
  uuid: string;
  name: string;
}

export const EditMeterDialog = ({ meter, open, onOpenChange, onSave }: EditMeterDialogProps) => {
  const { locationIntegrations, loading: integrationsLoading } = useLocationIntegrations(meter.location_id);
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { meters: allMeters } = useMeters(meter.location_id);
  const { data: locationChargePoints = [] } = useLocationChargePoints(meter.location_id);
  const { groups: allCpGroups = [] } = useChargePointGroups();
  const locationCpGroups = allCpGroups.filter((g) => g.location_id === meter.location_id);
  const [name, setName] = useState(meter.name);
  const [deviceType, setDeviceType] = useState((meter as any).device_type || "meter");
  const [meterNumber, setMeterNumber] = useState(meter.meter_number || "");
  const [energyType, setEnergyType] = useState(meter.energy_type);
  const [unit, setUnit] = useState(meter.unit);
  const [medium, setMedium] = useState(meter.medium || "");
  const [notes, setNotes] = useState(meter.notes || "");
  const [captureType, setCaptureType] = useState<"manual" | "automatic" | "virtual">(meter.capture_type as "manual" | "automatic" | "virtual");
  const [selectedIntegration, setSelectedIntegration] = useState(meter.location_integration_id || "");
  const [selectedSensor, setSelectedSensor] = useState(meter.sensor_uuid || "");
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parentMeterId, setParentMeterId] = useState(meter.parent_meter_id || "none");
  const [isMainMeter, setIsMainMeter] = useState(meter.is_main_meter);
  const [isBidirectional, setIsBidirectional] = useState((meter as any).is_bidirectional ?? false);
  const [meterFunction, setMeterFunction] = useState(meter.meter_function || "consumption");
  const [flowConvention, setFlowConvention] = useState<"negative_delivery" | "positive_delivery">(
    ((meter as any).flow_direction_convention as "negative_delivery" | "positive_delivery") || "negative_delivery",
  );
  const [selectedFloorId, setSelectedFloorId] = useState(meter.floor_id || "");
  const [selectedRoomId, setSelectedRoomId] = useState(meter.room_id || "");
  const [installationDate, setInstallationDate] = useState(meter.installation_date || "");
  const [meterOperator, setMeterOperator] = useState((meter as any).meter_operator || "");
  const [photoUrl, setPhotoUrl] = useState(meter.photo_url || "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [virtualSources, setVirtualSources] = useState<VirtualMeterSource[]>([]);
  const [gasType, setGasType] = useState((meter as any).gas_type || "H");
  const [zustandszahl, setZustandszahl] = useState((meter as any).zustandszahl != null ? String((meter as any).zustandszahl).replace(".", ",") : "0,9636");
  const [brennwertVal, setBrennwertVal] = useState((meter as any).brennwert != null ? String((meter as any).brennwert).replace(".", ",") : "");
  const [sourceUnit, setSourceUnit] = useState((meter as any).source_unit_power || "kW");
  const [offsetValue, setOffsetValue] = useState(
    (meter as any).meter_offset_kwh != null && Number((meter as any).meter_offset_kwh) !== 0
      ? String((meter as any).meter_offset_kwh).replace(".", ",")
      : ""
  );
  const [offsetReason, setOffsetReason] = useState<MeterOffsetReason | "">(
    ((meter as any).meter_offset_reason as MeterOffsetReason) || ""
  );
  const [offsetNote, setOffsetNote] = useState((meter as any).meter_offset_note || "");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [validatedAt, setValidatedAt] = useState<string | null>((meter as any).setup_validated_at ?? null);
  const [validatedByEmail, setValidatedByEmail] = useState<string | null>((meter as any).setup_validated_by_email ?? null);
  const [validating, setValidating] = useState(false);
  const [confirmValidateOpen, setConfirmValidateOpen] = useState(false);

  const handleValidateSetup = async () => {
    setValidating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      const userEmail = userData.user?.email ?? "unbekannt";
      if (!userId) {
        toast.error("Nicht angemeldet");
        return;
      }
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("meters")
        .update({
          setup_validated_at: now,
          setup_validated_by: userId,
          setup_validated_by_email: userEmail,
        } as any)
        .eq("id", meter.id);
      if (error) throw error;
      setValidatedAt(now);
      setValidatedByEmail(userEmail);
      toast.success("Messwert validiert");
    } catch (e: any) {
      toast.error(e?.message || "Validierung fehlgeschlagen");
    } finally {
      setValidating(false);
      setConfirmValidateOpen(false);
    }
  };
  // Available parents: all active meters except self and descendants
  const availableParents = allMeters.filter((m) => !m.is_archived && m.id !== meter.id);

  const enabledIntegrations = locationIntegrations.filter((li) => li.is_enabled);

  // Available parents: all active meters except self and descendants

  // Reset form when meter changes
  useEffect(() => {
    setName(meter.name);
    setDeviceType((meter as any).device_type || "meter");
    setMeterNumber(meter.meter_number || "");
    setEnergyType(meter.energy_type);
    setUnit(meter.unit);
    setMedium(meter.medium || "");
    setNotes(meter.notes || "");
    setCaptureType(meter.capture_type as "manual" | "automatic" | "virtual");
    setSelectedIntegration(meter.location_integration_id || "");
    setSelectedSensor(meter.sensor_uuid || "");
    setParentMeterId(meter.parent_meter_id || "none");
    setIsMainMeter(meter.is_main_meter);
    setIsBidirectional((meter as any).is_bidirectional ?? false);
    setMeterFunction(meter.meter_function || "consumption");
    setFlowConvention(
      ((meter as any).flow_direction_convention as "negative_delivery" | "positive_delivery") || "negative_delivery",
    );
    setSelectedFloorId(meter.floor_id || "");
    setSelectedRoomId(meter.room_id || "");
    setInstallationDate(meter.installation_date || "");
    setMeterOperator((meter as any).meter_operator || "");
    setPhotoUrl(meter.photo_url || "");
    setGasType((meter as any).gas_type || "H");
    setZustandszahl((meter as any).zustandszahl != null ? String((meter as any).zustandszahl).replace(".", ",") : "0,9636");
    setBrennwertVal((meter as any).brennwert != null ? String((meter as any).brennwert).replace(".", ",") : "");
    setSourceUnit((meter as any).source_unit_power || "kW");
    setOffsetValue(
      (meter as any).meter_offset_kwh != null && Number((meter as any).meter_offset_kwh) !== 0
        ? String((meter as any).meter_offset_kwh).replace(".", ",")
        : ""
    );
    setOffsetReason(((meter as any).meter_offset_reason as MeterOffsetReason) || "");
    setOffsetNote((meter as any).meter_offset_note || "");
    // Load virtual sources
    if (meter.capture_type === "virtual") {
      supabase
        .from("virtual_meter_sources")
        .select(
          "source_meter_id, source_charge_point_id, source_charge_point_group_id, source_all_charge_points, operator",
        )
        .eq("virtual_meter_id", meter.id)
        .order("sort_order")
        .then(({ data }) => {
          setVirtualSources((data as unknown as VirtualMeterSource[]) || []);
        });
    } else {
      setVirtualSources([]);
    }
  }, [meter]);

  // Auto-set unit when energy type changes (user interaction, not initial load)
  const initialEnergyTypeRef = useRef(meter.energy_type);
  useEffect(() => {
    // Only auto-set if user actively changed the energy type (not on initial render)
    if (energyType === initialEnergyTypeRef.current) return;
    initialEnergyTypeRef.current = energyType;
    if (energyType === "gas") setUnit("m³");
    else if (energyType === "wasser") setUnit("m³");
    else setUnit("kWh");
  }, [energyType]);

  // Fetch floors for the location
  useEffect(() => {
    if (!meter.location_id) { setFloors([]); return; }
    const fetchFloors = async () => {
      const { data } = await supabase
        .from("floors")
        .select("id, name, floor_number")
        .eq("location_id", meter.location_id)
        .order("floor_number");
      const list = (data as Floor[]) || [];
      setFloors(list);
      // Auto-select if only one floor and no floor set
      if (list.length === 1 && !meter.floor_id) {
        setSelectedFloorId(list[0].id);
      }
    };
    fetchFloors();
  }, [meter.location_id, meter.floor_id]);

  // Fetch rooms when floor changes
  useEffect(() => {
    if (!selectedFloorId) { setRooms([]); setSelectedRoomId((prev) => prev ? "" : prev); return; }
    const fetchRooms = async () => {
      const { data } = await supabase
        .from("floor_rooms")
        .select("id, name")
        .eq("floor_id", selectedFloorId)
        .order("name");
      const list = (data as Room[]) || [];
      setRooms(list);
      // Auto-select if only one room and no room previously set
      if (list.length === 1 && !meter.room_id) {
        setSelectedRoomId(list[0].id);
      } else if (!list.find((r) => r.id === selectedRoomId)) {
        setSelectedRoomId("");
      }
    };
    fetchRooms();
  }, [selectedFloorId]);

  // Fetch sensors when integration selected
  useEffect(() => {
    if (!selectedIntegration || captureType !== "automatic") {
      setSensors([]);
      return;
    }
    const li = enabledIntegrations.find((i) => i.id === selectedIntegration);
    if (!li) return;

    const fetchSensors = async () => {
      setSensorsLoading(true);
      try {
        const integrationType = li.integration?.type || "";
        const edgeFunction = getEdgeFunctionName(integrationType);
        const { data, error } = await invokeWithRetry(edgeFunction, {
          body: { locationIntegrationId: li.id, action: "getSensors" },
        });
        if (error || !data?.sensors) {
          // Fallback: try structure action for Loxone-type integrations
          if (integrationType === "loxone_miniserver") {
            const { data: structData, error: structErr } = await invokeWithRetry(edgeFunction, {
              body: { action: "structure", config: li.config },
            });
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
          const list: SensorOption[] = data.sensors.map((s: any) => ({
            uuid: s.id,
            name: s.name,
          }));
          setSensors(list.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        setSensors([]);
      } finally {
        setSensorsLoading(false);
      }
    };
    fetchSensors();
  }, [selectedIntegration, captureType]);

  const [photoFullscreen, setPhotoFullscreen] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      // Path MUST start with `${meter.id}/` to satisfy meter-photos RLS policy
      const filePath = `${meter.id}/${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from("meter-photos")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: urlData, error: urlError } = await supabase.storage
        .from("meter-photos")
        .createSignedUrl(data.path, 3600);
      if (urlError) throw urlError;
      setPhotoUrl(urlData.signedUrl);
      toast.success("Foto hochgeladen");
    } catch (err) {
      console.error("[EditMeterDialog] photo upload failed", err);
      toast.error(`Foto-Upload fehlgeschlagen: ${(err as Error).message ?? "Unbekannter Fehler"}`);
    }
    setUploadingPhoto(false);
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(meter.id, {
      name: name.trim(),
      device_type: deviceType,
      meter_number: meterNumber || undefined,
      energy_type: deviceType === "meter" ? energyType : "none",
      unit: deviceType === "meter" ? unit : "",
      medium: medium || undefined,
      notes: notes || undefined,
      capture_type: captureType,
      location_integration_id: captureType === "automatic" && selectedIntegration ? selectedIntegration : undefined,
      sensor_uuid: captureType === "automatic" && selectedSensor ? selectedSensor : undefined,
      parent_meter_id: parentMeterId && parentMeterId !== "none" ? parentMeterId : null,
      is_main_meter: isMainMeter,
      is_bidirectional: isBidirectional,
      meter_function: meterFunction,
      flow_direction_convention: flowConvention,
      floor_id: selectedFloorId || null,
      room_id: selectedRoomId || null,
      installation_date: installationDate || undefined,
      meter_operator: meterOperator || undefined,
      photo_url: photoUrl || undefined,
      ...(deviceType === "meter" && energyType === "gas" ? {
        gas_type: gasType,
        zustandszahl: zustandszahl ? parseFloat(zustandszahl.replace(",", ".")) : null,
        brennwert: brennwertVal ? parseFloat(brennwertVal.replace(",", ".")) : null,
      } : { gas_type: null, zustandszahl: null, brennwert: null }),
      source_unit_power: captureType === "automatic" ? sourceUnit : null,
      source_unit_energy: captureType === "automatic" ? deriveEnergyUnit(sourceUnit) : null,
      ...(deviceType === "meter" ? (() => {
        const parsed = offsetValue.trim() ? parseFloat(offsetValue.replace(",", ".")) : 0;
        const finalOffset = Number.isFinite(parsed) ? parsed : 0;
        return {
          meter_offset_kwh: finalOffset,
          meter_offset_reason: finalOffset !== 0 ? (offsetReason || null) : null,
          meter_offset_note: finalOffset !== 0 ? (offsetNote.trim() || null) : null,
          meter_offset_set_at:
            finalOffset !== 0 && Number(meter.meter_offset_kwh ?? 0) !== finalOffset
              ? new Date().toISOString()
              : ((meter as any).meter_offset_set_at ?? null),
        };
      })() : {}),
    } as any);

    // Update virtual sources
    if (captureType === "virtual") {
      await supabase.from("virtual_meter_sources").delete().eq("virtual_meter_id", meter.id);
      if (virtualSources.length > 0) {
        const rows = virtualSources.map((s, i) => ({
          virtual_meter_id: meter.id,
          source_meter_id: s.source_meter_id ?? null,
          source_charge_point_id: s.source_charge_point_id ?? null,
          source_charge_point_group_id: s.source_charge_point_group_id ?? null,
          source_all_charge_points: s.source_all_charge_points ?? false,
          operator: s.operator,
          sort_order: i,
        }));
        await supabase.from("virtual_meter_sources").insert(rows as any);
      }
    } else {
      // Clean up old virtual sources if switching away from virtual
      await supabase.from("virtual_meter_sources").delete().eq("virtual_meter_id", meter.id);
    }

    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerät bearbeiten – {meter.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          {/* Setup validation */}
          <div className={`rounded-md border p-3 ${validatedAt ? "bg-emerald-500/10 border-emerald-500/30" : "bg-muted/30"}`}>
            {validatedAt ? (
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Einrichtung validiert</p>
                  <p className="text-muted-foreground">
                    Messwert wurde am{" "}
                    {new Date(validatedAt).toLocaleString("de-DE", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}{" "}
                    von {validatedByEmail ?? "unbekannt"} geprüft und validiert.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  Einrichtung dieses Geräts noch nicht validiert.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setConfirmValidateOpen(true)}
                  disabled={validating}
                >
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                  Einrichtung validieren
                </Button>
              </div>
            )}
          </div>

          <AlertDialog open={confirmValidateOpen} onOpenChange={setConfirmValidateOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Einrichtung validieren?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hiermit bestätigst du, dass die Einrichtung dieses Geräts geprüft wurde.
                  Datum, Uhrzeit und dein Benutzername werden dauerhaft gespeichert und können nicht mehr geändert werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={validating}>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); handleValidateSetup(); }}
                  disabled={validating}
                >
                  {validating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Bestätigen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>



          {/* Device type selector */}
          <div>
            <Label className="mb-2 block">Gerätetyp *</Label>
            <Select value={deviceType} onValueChange={setDeviceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="meter">Zähler</SelectItem>
                <SelectItem value="sensor">Sensor</SelectItem>
                <SelectItem value="actuator">Aktor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">Erfassungsart *</Label>
            <RadioGroup
              value={captureType}
              onValueChange={(v) => setCaptureType(v as "manual" | "automatic" | "virtual")}
              className="flex flex-wrap gap-x-6 gap-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="edit-capture-manual" />
                <Label htmlFor="edit-capture-manual" className="cursor-pointer font-normal">Manuelle Erfassung</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="automatic" id="edit-capture-automatic" />
                <Label htmlFor="edit-capture-automatic" className="cursor-pointer font-normal">Automatische Erfassung</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="virtual" id="edit-capture-virtual" />
                <Label htmlFor="edit-capture-virtual" className="cursor-pointer font-normal">Virtueller Zähler</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Virtual: Formula builder */}
          {captureType === "virtual" && (
            <VirtualMeterFormulaBuilder
              sources={virtualSources}
              onSourcesChange={setVirtualSources}
              availableMeters={allMeters.filter((m) => !m.is_archived && m.id !== meter.id)}
              availableChargePoints={locationChargePoints.map((cp) => ({ id: cp.id, name: cp.name }))}
              availableChargePointGroups={locationCpGroups.map((g) => ({ id: g.id, name: g.name }))}
            />
          )}

          {captureType === "automatic" && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
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
                  <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
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
                  <Label>Sensor *</Label>
                  {sensorsLoading ? (
                    <Skeleton className="h-9 w-full mt-1" />
                  ) : sensors.length === 0 && selectedSensor ? (
                    <p className="text-sm mt-1">{sensors.find((s) => s.uuid === selectedSensor)?.name || meter.name || selectedSensor}</p>
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
              {/* Source unit for automatic meters */}
              {selectedIntegration && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">Einheit des Gateways</p>
                  <Select value={sourceUnit} onValueChange={setSourceUnit}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_UNIT_GROUPS.map((group) => (
                        <SelectGroup key={group.label}>
                          <SelectLabel>{group.label}</SelectLabel>
                          {group.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Welche Einheit liefert Ihr Gateway für dieses Gerät? Bei Loxone in der Loxone Config unter den Ausgängen des Zählers sichtbar; bei Sensoren (z. B. Shelly H&T) z. B. °C für Temperatur oder % für Luftfeuchte.</p>
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {deviceType === "meter" && (
            <div>
              <Label>Zählernummer</Label>
              <Input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} />
            </div>
          )}
          {deviceType === "meter" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Energieart</Label>
                <Select value={energyType} onValueChange={setEnergyType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strom">{T("energy.strom")}</SelectItem>
                    <SelectItem value="gas">{T("energy.gas")}</SelectItem>
                    <SelectItem value="waerme">{T("energy.waerme")}</SelectItem>
                    <SelectItem value="wasser">{T("energy.wasser")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Einheit</Label>
                {energyType === "gas" ? (
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m³">m³</SelectItem>
                      <SelectItem value="kWh">kWh</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
                )}
              </div>
            </div>
          )}
          <div>
            <Label>Medium</Label>
            <Input value={medium} onChange={(e) => setMedium(e.target.value)} />
          </div>
          {/* Gas-specific fields */}
          {deviceType === "meter" && energyType === "gas" && unit === "m³" && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <p className="text-sm font-medium text-muted-foreground">Gas-Parameter</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Gasart *</Label>
                  <Select value={gasType} onValueChange={setGasType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="H">H-Gas (hochkalorisch)</SelectItem>
                      <SelectItem value="L">L-Gas (niederkalorisch)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Zustandszahl</Label>
                  <Input value={zustandszahl} onChange={(e) => setZustandszahl(e.target.value)} placeholder="0,9636" className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-0.5">In der Regel &lt; 1</p>
                </div>
              </div>
              <div>
                <Label>Brennwert (kWh/m³)</Label>
                <Input value={brennwertVal} onChange={(e) => setBrennwertVal(e.target.value)} placeholder={gasType === "H" ? "11,5" : "8,9"} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-0.5">Leer = Standardwert ({gasType === "H" ? "11,5" : "8,9"} kWh/m³)</p>
              </div>
            </div>
          )}
          {/* Floor & Room assignment */}
          {floors.length > 0 && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <p className="text-sm font-medium text-muted-foreground">Zuordnung</p>
              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <Layers className="h-3.5 w-3.5" />
                  Etage
                </Label>
                <Select value={selectedFloorId} onValueChange={(v) => { setSelectedFloorId(v); setSelectedRoomId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Etage wählen" /></SelectTrigger>
                  <SelectContent>
                    {floors.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {rooms.length > 0 && selectedFloorId && (
                <div>
                  <Label className="flex items-center gap-1.5 mb-1">
                    <DoorOpen className="h-3.5 w-3.5" />
                    Raum
                  </Label>
                  <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                    <SelectTrigger><SelectValue placeholder="Optional: Raum wählen" /></SelectTrigger>
                    <SelectContent>
                      {rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {/* Hierarchy - only for meters */}
          {deviceType === "meter" && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label>Hauptzähler (Netzübergabepunkt)</Label>
                <Switch checked={isMainMeter} onCheckedChange={setIsMainMeter} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Bidirektionaler Zähler (Bezug & Einspeisung)</Label>
                <Switch checked={isBidirectional} onCheckedChange={setIsBidirectional} />
              </div>
              <div>
                <Label>Zählerfunktion</Label>
                <Select value={meterFunction} onValueChange={setMeterFunction}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consumption">Verbrauch</SelectItem>
                    <SelectItem value="generation">Erzeugung (z.B. PV)</SelectItem>
                    <SelectItem value="technical">Technisch (z.B. Wärmepumpe)</SelectItem>
                    <SelectItem value="bidirectional">Bidirektional (Bezug & Einspeisung)</SelectItem>
                    <SelectItem value="submeter">Unterzähler</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Übergeordneter Zähler</Label>
                <Select value={parentMeterId} onValueChange={setParentMeterId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Kein (Hauptzähler)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein übergeordneter Zähler</SelectItem>
                    {availableParents.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {/* Offset / Anfangsbestand - only for meters */}
          {deviceType === "meter" && (
            <MeterOffsetSection
              value={offsetValue}
              onValueChange={setOffsetValue}
              reason={offsetReason}
              onReasonChange={setOffsetReason}
              note={offsetNote}
              onNoteChange={setOffsetNote}
              unit={unit || "kWh"}
            />
          )}
          {/* Photo, Installation Date, Operator */}
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <p className="text-sm font-medium text-muted-foreground">Zusatzinformationen</p>
            <div>
              <Label>Foto</Label>
              <div className="flex items-center gap-3 mt-1">

                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoFullscreen(true)}
                    className="rounded-md overflow-hidden border h-16 w-16 shrink-0 hover:ring-2 hover:ring-primary transition"
                    title="Foto vergrößern"
                  >
                    <img src={photoUrl} alt="Zählerfoto" className="h-full w-full object-cover" />
                  </button>
                )}
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
                  {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {photoUrl ? "Foto ändern" : "Foto hochladen"}
                </Button>
                {photoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPhotoUrl("")}>Entfernen</Button>
                )}
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </div>
            <div>
              <Label>Installationsdatum</Label>
              <Input type="date" value={installationDate} onChange={(e) => setInstallationDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Messstellenbetreiber</Label>
              <Input value={meterOperator} onChange={(e) => setMeterOperator(e.target.value)} placeholder="z.B. Netzbetreiber GmbH" className="mt-1" />
            </div>
          </div>
          {photoFullscreen && photoUrl && (
            <div
              className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
              onClick={() => setPhotoFullscreen(false)}
            >
              <img src={photoUrl} alt="Zählerfoto" className="max-w-[95vw] max-h-[95vh] object-contain" />
            </div>
          )}
          <div>
            <Label>Notizen</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReplaceOpen(true)}
            className="gap-1.5 sm:mr-auto"
            title="Defektes Gerät gegen ein neues tauschen"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Gerät tauschen
          </Button>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || saving || (captureType === "automatic" && (!selectedIntegration || !selectedSensor))}
            >
              {saving ? "Speichern…" : "Speichern"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <ReplaceDeviceDialog
        meter={meter}
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        onReplaced={() => onOpenChange(false)}
      />
    </Dialog>
  );
};
