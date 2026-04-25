import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";
import { invokeWithRetry } from "@/lib/invokeWithRetry";
import { useMeters } from "@/hooks/useMeters";
import { useLocationIntegrations, LocationIntegration } from "@/hooks/useIntegrations";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AlertCircle } from "lucide-react";
import { VirtualMeterFormulaBuilder, VirtualMeterSource } from "./VirtualMeterFormulaBuilder";

interface AddMeterDialogProps {
  locationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SensorOption {
  uuid: string;
  name: string;
  integrationName: string;
  locationIntegrationId: string;
}

export const AddMeterDialog = ({ locationId, open, onOpenChange }: AddMeterDialogProps) => {
  const { addMeter, meters } = useMeters(locationId);
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { locationIntegrations, loading: integrationsLoading } = useLocationIntegrations(locationId);
  const [name, setName] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [energyType, setEnergyType] = useState("strom");
  const [unit, setUnit] = useState("kWh");
  const [medium, setMedium] = useState("");
  const [notes, setNotes] = useState("");
  const [captureType, setCaptureType] = useState<"manual" | "automatic" | "virtual">("manual");
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const [sensors, setSensors] = useState<SensorOption[]>([]);
  const [sensorsLoading, setSensorsLoading] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState("");
  const [parentMeterId, setParentMeterId] = useState("");
  const [isMainMeter, setIsMainMeter] = useState(false);
  const [isBidirectional, setIsBidirectional] = useState(false);
  const [meterFunction, setMeterFunction] = useState("consumption");
  const [virtualSources, setVirtualSources] = useState<VirtualMeterSource[]>([]);
  const [gasType, setGasType] = useState("H");
  const [zustandszahl, setZustandszahl] = useState("0,9636");
  const [brennwert, setBrenwert] = useState("");
  const [sourceUnit, setSourceUnit] = useState("kW");

  const activeMeters = meters.filter((m) => !m.is_archived);

  // Auto-set unit when energy type changes
  useEffect(() => {
    if (energyType === "gas") setUnit("m³");
    else if (energyType === "wasser") setUnit("m³");
    else setUnit("kWh");
  }, [energyType]);

  const unitOptions = energyType === "gas" ? ["m³", "kWh"] : null;

  const enabledIntegrations = locationIntegrations.filter((li) => li.is_enabled);

  // Fetch sensors when an integration is selected
  useEffect(() => {
    if (!selectedIntegration || captureType !== "automatic") {
      setSensors([]);
      setSelectedSensor("");
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
          body: {
            locationIntegrationId: li.id,
            action: "getSensors",
          },
        });

        if (error || !data?.sensors) {
          // Fallback: try structure action for Loxone-type integrations
          if (integrationType === "loxone_miniserver") {
            const { data: structData, error: structErr } = await invokeWithRetry(edgeFunction, {
              body: { action: "structure", config: li.config },
            });
            if (!structErr && structData?.controls) {
              const sensorList: SensorOption[] = [];
              const controls = structData.controls as Record<string, { name: string; uuidAction: string }>;
              Object.values(controls).forEach((ctrl) => {
                if (ctrl.name && ctrl.uuidAction) {
                  sensorList.push({
                    uuid: ctrl.uuidAction,
                    name: ctrl.name,
                    integrationName: li.integration?.name || "Gateway",
                    locationIntegrationId: li.id,
                  });
                }
              });
              setSensors(sensorList.sort((a, b) => a.name.localeCompare(b.name)));
              return;
            }
          }
          setSensors([]);
        } else {
          const sensorList: SensorOption[] = data.sensors.map((s: any) => ({
            uuid: s.id,
            name: s.name,
            integrationName: li.integration?.name || "Gateway",
            locationIntegrationId: li.id,
          }));
          setSensors(sensorList.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch {
        setSensors([]);
      } finally {
        setSensorsLoading(false);
      }
    };

    fetchSensors();
  }, [selectedIntegration, captureType]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const parsedZustandszahl = zustandszahl ? parseFloat(zustandszahl.replace(",", ".")) : undefined;
    const parsedBrennwert = brennwert ? parseFloat(brennwert.replace(",", ".")) : undefined;
    await addMeter(
      {
        name: name.trim(),
        location_id: locationId,
        meter_number: meterNumber || undefined,
        energy_type: energyType,
        unit,
        medium: medium || undefined,
        notes: notes || undefined,
        capture_type: captureType,
        location_integration_id: captureType === "automatic" && selectedIntegration ? selectedIntegration : undefined,
        sensor_uuid: captureType === "automatic" && selectedSensor ? selectedSensor : undefined,
        ...(energyType === "gas" ? { gas_type: gasType, zustandszahl: parsedZustandszahl, brennwert: parsedBrennwert || undefined } : {}),
        ...(captureType === "automatic" ? { source_unit_power: sourceUnit, source_unit_energy: sourceUnit === "m³" ? "m³" : sourceUnit === "kW" ? "kWh" : "Wh" } : {}),
        is_bidirectional: isBidirectional,
      } as any,
      parentMeterId && parentMeterId !== "none" ? parentMeterId : null,
      isMainMeter,
      meterFunction,
      captureType === "virtual" ? virtualSources : undefined,
    );
    resetAndClose();
  };

  const resetAndClose = () => {
    setName("");
    setMeterNumber("");
    setEnergyType("strom");
    setUnit("kWh");
    setMedium("");
    setNotes("");
    setCaptureType("manual");
    setSelectedIntegration("");
    setSelectedSensor("");
    setSensors([]);
    setParentMeterId("");
    setIsMainMeter(false);
    setIsBidirectional(false);
    setMeterFunction("consumption");
    setVirtualSources([]);
    setGasType("H");
    setZustandszahl("0,9636");
    setBrenwert("");
    setSourceUnit("kW");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zähler anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Capture Type */}
          <div>
            <Label className="mb-2 block">Erfassungsart *</Label>
            <RadioGroup
              value={captureType}
              onValueChange={(v) => setCaptureType(v as "manual" | "automatic" | "virtual")}
              className="flex flex-wrap gap-x-6 gap-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="capture-manual" />
                <Label htmlFor="capture-manual" className="cursor-pointer font-normal">
                  Manuelle Erfassung
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="automatic" id="capture-automatic" />
                <Label htmlFor="capture-automatic" className="cursor-pointer font-normal">
                  Automatische Erfassung
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="virtual" id="capture-virtual" />
                <Label htmlFor="capture-virtual" className="cursor-pointer font-normal">
                  Virtueller Zähler
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Virtual: Formula builder */}
          {captureType === "virtual" && (
            <VirtualMeterFormulaBuilder
              sources={virtualSources}
              onSourcesChange={setVirtualSources}
              availableMeters={activeMeters}
            />
          )}

          {/* Automatic: Integration + Sensor selection */}
          {captureType === "automatic" && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div>
                <Label>Datengateway *</Label>
                {integrationsLoading ? (
                  <Skeleton className="h-9 w-full mt-1" />
                ) : enabledIntegrations.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <AlertCircle className="h-4 w-4" />
                    <span>Kein aktives Gateway für diesen Standort konfiguriert.</span>
                  </div>
                ) : (
                  <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Gateway auswählen" /></SelectTrigger>
                    <SelectContent>
                      {enabledIntegrations.map((li) => (
                        <SelectItem key={li.id} value={li.id}>
                          {li.integration?.name || "Gateway"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {selectedIntegration && (
                <div>
                  <Label>Sensor zuordnen *</Label>
                  {sensorsLoading ? (
                    <Skeleton className="h-9 w-full mt-1" />
                  ) : sensors.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">Keine Sensoren gefunden.</p>
                  ) : (
                    <Select value={selectedSensor} onValueChange={(val) => {
                      setSelectedSensor(val);
                      const sensor = sensors.find((s) => s.uuid === val);
                      if (sensor && !name) setName(sensor.name);
                    }}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Sensor auswählen" /></SelectTrigger>
                      <SelectContent>
                        {sensors.map((s) => (
                          <SelectItem key={s.uuid} value={s.uuid}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              {/* Source unit */}
              {selectedIntegration && (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground">Einheit des Gateways</p>
                  <Select value={sourceUnit} onValueChange={setSourceUnit}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kW">kW / kWh</SelectItem>
                      <SelectItem value="W">W / Wh</SelectItem>
                      <SelectItem value="m³">m³</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Welche Einheiten liefert Ihr Gateway? In der Loxone Config unter den Ausgängen des Zählers sichtbar.</p>
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Hauptzähler Strom" />
          </div>
          <div>
            <Label>Zählernummer</Label>
            <Input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} placeholder="z.B. 12345678" />
          </div>
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
              {unitOptions ? (
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kWh" />
              )}
            </div>
          </div>
          <div>
            <Label>Medium</Label>
            <Input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="z.B. Fernwärme" />
          </div>
          {/* Gas-specific fields */}
          {energyType === "gas" && unit === "m³" && (
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
                <Input value={brennwert} onChange={(e) => setBrenwert(e.target.value)} placeholder={gasType === "H" ? "11,5" : "8,9"} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-0.5">Leer = Standardwert ({gasType === "H" ? "11,5" : "8,9"} kWh/m³)</p>
              </div>
            </div>
          )}
          {/* Hierarchy */}
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
                  {activeMeters.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notizen</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !name.trim() ||
              (captureType === "automatic" && (!selectedIntegration || !selectedSensor)) ||
              (captureType === "virtual" && virtualSources.length < 2)
            }
          >
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
