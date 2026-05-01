import { useState, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Info, ExternalLink, Save, Sun } from "lucide-react";
import { useChargePointSolarChargingConfig } from "@/hooks/useSolarChargingConfig";
import { useMeters } from "@/hooks/useMeters";
import { useNavigate } from "react-router-dom";

interface Props {
  chargePointId: string;
  locationId: string | null;
  isAdmin: boolean;
  pvSurplusEnabled: boolean;
}

/**
 * PV-Überschussladen-Konfiguration für einen einzelnen Ladepunkt.
 * Identische Parameter wie bei Gruppen — ohne Prioritätsmodus
 * (entfällt bei nur einem Ladepunkt).
 */
export default function ChargePointSolarChargingConfig({
  chargePointId,
  locationId,
  isAdmin,
  pvSurplusEnabled,
}: Props) {
  const { config, upsert } = useChargePointSolarChargingConfig(chargePointId);
  const { meters } = useMeters(locationId ?? "");
  const navigate = useNavigate();

  const [referenceMeter, setReferenceMeter] = useState("");
  const [minPower, setMinPower] = useState(1400);
  const [buffer, setBuffer] = useState(200);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (config) {
      setReferenceMeter(config.reference_meter_id || "");
      setMinPower(config.min_charge_power_w);
      setBuffer(config.safety_buffer_w);
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
      charge_point_id: chargePointId,
      reference_meter_id: referenceMeter || null,
      min_charge_power_w: minPower,
      safety_buffer_w: buffer,
      priority_mode: "equal_split",
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
          <Label htmlFor={`solar-active-cp-${chargePointId}`} className="text-xs">Aktiv</Label>
          <Switch
            id={`solar-active-cp-${chargePointId}`}
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={!isAdmin}
          />
        </div>
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Min. Leistung (W)</Label>
          <Input
            type="number"
            value={minPower}
            onChange={(e) => setMinPower(Number(e.target.value))}
            min={0}
            step={100}
            className="h-8 text-xs"
            disabled={!isAdmin}
          />
          <p className="text-[10px] text-muted-foreground">6A ≈ 1.400 W</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Puffer (W)</Label>
          <Input
            type="number"
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
            min={0}
            step={50}
            className="h-8 text-xs"
            disabled={!isAdmin}
          />
          <p className="text-[10px] text-muted-foreground">Reserve Gebäude</p>
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
