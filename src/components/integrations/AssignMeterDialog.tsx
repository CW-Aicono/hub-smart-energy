import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { toast } from "sonner";

interface AssignMeterSensor {
  id: string;
  name: string;
  controlType?: string;
  unit: string;
  /** Pre-classified device type from the discovery dialog */
  deviceType?: "meter" | "sensor" | "actuator";
}

interface AssignMeterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Support single or multiple sensors */
  sensor?: AssignMeterSensor;
  sensors?: AssignMeterSensor[];
  locationIntegrationId: string;
  /** Liegenschaft des Gateways – Geräte werden hier automatisch zugeordnet. */
  currentLocationId: string;
}

export function AssignMeterDialog({
  open,
  onOpenChange,
  sensor,
  sensors: sensorsProp,
  locationIntegrationId,
  currentLocationId,
}: AssignMeterDialogProps) {
  const sensorList = sensorsProp || (sensor ? [sensor] : []);

  const { locations } = useLocations();
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const { addMeter } = useMeters();

  const [energyType, setEnergyType] = useState("strom");
  const [saving, setSaving] = useState(false);

  const uniformDeviceType: "meter" | "sensor" | "actuator" | null = (() => {
    if (sensorList.length === 0) return null;
    const first = sensorList[0].deviceType;
    if (!first) return null;
    return sensorList.every((s) => s.deviceType === first) ? first : null;
  })();

  const targetLocation = locations.find((l) => l.id === currentLocationId);

  const handleSubmit = async () => {
    if (!currentLocationId || sensorList.length === 0) return;
    setSaving(true);

    try {
      for (const s of sensorList) {
        const dt: "meter" | "sensor" | "actuator" = s.deviceType ?? "sensor";
        await addMeter({
          name: s.name.trim(),
          location_id: currentLocationId,
          energy_type: energyType,
          unit: s.unit || (dt === "meter" ? "kWh" : ""),
          capture_type: "automatic",
          device_type: dt,
          location_integration_id: locationIntegrationId,
          sensor_uuid: s.id,
        });
      }

      const count = sensorList.length;
      const typeLabel = uniformDeviceType === "meter"
        ? "Zähler"
        : uniformDeviceType === "actuator"
          ? "Aktor"
          : uniformDeviceType === "sensor"
            ? "Sensor"
            : "Gerät";
      const pluralLabel = uniformDeviceType === "meter"
        ? "Zähler"
        : uniformDeviceType === "actuator"
          ? "Aktoren"
          : uniformDeviceType === "sensor"
            ? "Sensoren"
            : "Geräte";
      toast.success(count === 1
        ? `${typeLabel} "${sensorList[0].name}" erfolgreich zugeordnet`
        : `${count} ${pluralLabel} erfolgreich zugeordnet`
      );
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to assign meter:", err);
      toast.error("Zuordnung fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {sensorList.length === 1 ? "Gerät zuordnen" : `${sensorList.length} Geräte zuordnen`}
          </DialogTitle>
          <DialogDescription>
            {sensorList.length === 1
              ? `Ordnen Sie „${sensorList[0].name}" der Liegenschaft des Gateways zu.`
              : `Ordnen Sie ${sensorList.length} ausgewählte Geräte der Liegenschaft des Gateways zu.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sensor list preview for bulk */}
          {sensorList.length > 1 && (
            <div className="rounded-md border p-3 bg-muted/30 max-h-32 overflow-auto">
              <p className="text-xs font-medium text-muted-foreground mb-1">Ausgewählte Geräte:</p>
              <ul className="text-sm space-y-0.5">
                {sensorList.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Liegenschaft (read-only info) */}
          <div className="rounded-md border p-3 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground mb-1">Liegenschaft (vom Gateway)</p>
            <p className="text-sm font-medium">{targetLocation?.name ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Etage und Raum können später je Gerät individuell zugeordnet werden.
            </p>
          </div>

          {/* Energy type */}
          <div>
            <Label>Energieart</Label>
            <Select value={energyType} onValueChange={setEnergyType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strom">{T("energy.strom")}</SelectItem>
                <SelectItem value="gas">{T("energy.gas")}</SelectItem>
                <SelectItem value="waerme">{T("energy.waerme")}</SelectItem>
                <SelectItem value="wasser">{T("energy.wasser")}</SelectItem>
                <SelectItem value="none">Keine / Sonstige</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Gilt für alle ausgewählten Geräte. Kann später je Gerät angepasst werden.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!currentLocationId || saving}>
            {saving ? "Wird zugeordnet..." : sensorList.length === 1 ? "Zuordnen" : `${sensorList.length} Zuordnen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
