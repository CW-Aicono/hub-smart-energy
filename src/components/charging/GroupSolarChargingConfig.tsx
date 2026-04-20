import { useState, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, ExternalLink, Save, Sun } from "lucide-react";
import { useSolarChargingConfig } from "@/hooks/useSolarChargingConfig";
import { useMeters } from "@/hooks/useMeters";
import { useChargePoints } from "@/hooks/useChargePoints";
import { useLocations } from "@/hooks/useLocations";
import { useNavigate } from "react-router-dom";

interface Props {
  groupId: string;
  isAdmin: boolean;
  /** Whether the PV surplus switch in energy_settings is on */
  pvSurplusEnabled: boolean;
}

export default function GroupSolarChargingConfig({ groupId, isAdmin, pvSurplusEnabled }: Props) {
  const { config, isLoading, upsert } = useSolarChargingConfig(groupId);
  const { chargePoints } = useChargePoints();
  const { locations } = useLocations();
  const navigate = useNavigate();

  // Determine location from group's charge points
  const groupChargePoints = useMemo(
    () => chargePoints.filter((cp) => (cp as any).group_id === groupId),
    [chargePoints, groupId]
  );
  const locationId = groupChargePoints[0]?.location_id || locations[0]?.id || "";
  const { meters } = useMeters(locationId);

  const [referenceMeter, setReferenceMeter] = useState("");
  const [minPower, setMinPower] = useState(1400);
  const [buffer, setBuffer] = useState(200);
  const [priorityMode, setPriorityMode] = useState("equal_split");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (config) {
      setReferenceMeter(config.reference_meter_id || "");
      setMinPower(config.min_charge_power_w);
      setBuffer(config.safety_buffer_w);
      setPriorityMode(config.priority_mode);
      setIsActive(config.is_active);
    }
  }, [config]);

  const bidirectionalMeters = useMemo(
    () => meters.filter((m) => m.meter_function === "bidirectional"),
    [meters]
  );

  useEffect(() => {
    if (!referenceMeter && bidirectionalMeters.length > 0) {
      setReferenceMeter(bidirectionalMeters[0].id);
    }
  }, [bidirectionalMeters, referenceMeter]);

  const handleSave = () => {
    upsert.mutate({
      group_id: groupId,
      reference_meter_id: referenceMeter || null,
      min_charge_power_w: minPower,
      safety_buffer_w: buffer,
      priority_mode: priorityMode,
      is_active: isActive,
    });
  };

  if (!pvSurplusEnabled) return null;

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-yellow-500/5 border-yellow-500/20">
      <div className="flex items-center gap-2">
        <Sun className="h-4 w-4 text-yellow-500" />
        <p className="font-medium text-sm">PV-Überschussladen – Konfiguration</p>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor={`solar-active-${groupId}`} className="text-xs">Aktiv</Label>
          <Switch id={`solar-active-${groupId}`} checked={isActive} onCheckedChange={setIsActive} disabled={!isAdmin} />
        </div>
      </div>

      {/* Reference meter */}
      <div className="space-y-1.5">
        <Label className="text-xs">Referenzzähler (Einspeisezähler)</Label>
        {bidirectionalMeters.length > 0 ? (
          <Select value={referenceMeter} onValueChange={setReferenceMeter} disabled={!isAdmin}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Einspeisezähler wählen" />
            </SelectTrigger>
            <SelectContent>
              {bidirectionalMeters.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.meter_number || "—"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Alert variant="destructive" className="border-yellow-500/50 bg-yellow-500/5">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
            <AlertDescription className="text-xs">
              <strong>Kein Einspeisezähler gefunden.</strong> Erstellen Sie einen virtuellen Zähler:
              <span className="font-mono bg-muted px-1 py-0.5 rounded mx-1 text-[10px]">Erzeugung − Verbrauch = Überschuss</span>
              <Button variant="link" size="sm" className="gap-1 px-0 ml-1 h-auto text-xs" onClick={() => navigate("/meters")}>
                <ExternalLink className="h-3 w-3" /> Zählerverwaltung
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" />
          Negativer Leistungswert = verfügbarer PV-Überschuss.
        </p>
      </div>

      {/* Parameters */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Min. Leistung (W)</Label>
          <Input type="number" value={minPower} onChange={(e) => setMinPower(Number(e.target.value))} min={0} step={100} className="h-8 text-xs" disabled={!isAdmin} />
          <p className="text-[10px] text-muted-foreground">6A ≈ 1.400 W</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Puffer (W)</Label>
          <Input type="number" value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} min={0} step={50} className="h-8 text-xs" disabled={!isAdmin} />
          <p className="text-[10px] text-muted-foreground">Reserve Gebäude</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Priorisierung</Label>
          <Select value={priorityMode} onValueChange={setPriorityMode} disabled={!isAdmin}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first_come">First come</SelectItem>
              <SelectItem value="equal_split">Gleichmäßig</SelectItem>
              <SelectItem value="manual">Manuell</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isAdmin && (
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {upsert.isPending ? "Speichern…" : "Speichern"}
        </Button>
      )}
    </div>
  );
}
