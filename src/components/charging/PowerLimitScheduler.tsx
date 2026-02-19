import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Check, Clock, Gauge, Info, Zap } from "lucide-react";

export interface PowerLimitSchedule {
  enabled: boolean;
  /** "allday" = ganztägig, "window" = Zeitfenster von-bis */
  mode: "allday" | "window";
  /** HH:mm, nur relevant bei mode=window */
  time_from: string;
  /** HH:mm, kann nächsten Tag bedeuten wenn time_to < time_from */
  time_to: string;
  /** "kw" = fester kW-Wert, "minimal" = minimale mögliche Leistung */
  limit_type: "kw" | "minimal";
  limit_kw: number | null;
}

export const defaultPowerLimitSchedule: PowerLimitSchedule = {
  enabled: false,
  mode: "allday",
  time_from: "18:00",
  time_to: "07:00",
  limit_type: "kw",
  limit_kw: null,
};

interface Props {
  value: PowerLimitSchedule;
  onChange: (v: PowerLimitSchedule) => void;
  onSave: () => void;
  isSaving?: boolean;
  disabled?: boolean;
  /** Max power of the charge point / group for validation hint */
  maxPowerKw?: number;
}

export function PowerLimitScheduler({ value, onChange, onSave, isSaving, disabled, maxPowerKw }: Props) {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const set = (patch: Partial<PowerLimitSchedule>) => onChange({ ...value, ...patch });

  // Detect overnight schedule (e.g. 18:00–07:00 = next morning)
  const isOvernight = value.mode === "window" && value.time_from > value.time_to;

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <p className="font-medium">Leistungsbegrenzung aktivieren</p>
          <p className="text-sm text-muted-foreground">Maximale Ladeleistung zeitgesteuert begrenzen</p>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(v) => set({ enabled: v })}
          disabled={disabled}
        />
      </div>

      {value.enabled && (
        <>
          {/* Time mode */}
          <div className="p-4 border rounded-lg space-y-4">
            <p className="font-medium flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Geltungszeitraum
            </p>
            <RadioGroup
              value={value.mode}
              onValueChange={(v) => set({ mode: v as "allday" | "window" })}
              disabled={disabled}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="allday" id="mode-allday" />
                <Label htmlFor="mode-allday" className="font-normal cursor-pointer">Ganztägig</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="window" id="mode-window" />
                <Label htmlFor="mode-window" className="font-normal cursor-pointer">Zeitfenster (von – bis)</Label>
              </div>
            </RadioGroup>

            {value.mode === "window" && (
              <div className="space-y-2 pl-6">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Von</Label>
                    <Input
                      type="time"
                      value={value.time_from}
                      onChange={(e) => set({ time_from: e.target.value })}
                      disabled={disabled}
                      className="w-32"
                    />
                  </div>
                  <span className="text-muted-foreground mt-5">–</span>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Bis</Label>
                    <Input
                      type="time"
                      value={value.time_to}
                      onChange={(e) => set({ time_to: e.target.value })}
                      disabled={disabled}
                      className="w-32"
                    />
                  </div>
                </div>
                {isOvernight && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Übernacht-Zeitfenster: gilt von {value.time_from} Uhr bis zum nächsten Morgen um {value.time_to} Uhr.
                  </p>
                )}
                {!isOvernight && value.time_from && value.time_to && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Gilt täglich von {value.time_from} bis {value.time_to} Uhr.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Limit type */}
          <div className="p-4 border rounded-lg space-y-4">
            <p className="font-medium flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              Begrenzungswert
            </p>
            <RadioGroup
              value={value.limit_type}
              onValueChange={(v) => set({ limit_type: v as "kw" | "minimal" })}
              disabled={disabled}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="kw" id="limit-kw" />
                <Label htmlFor="limit-kw" className="font-normal cursor-pointer">Fester kW-Wert</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="minimal" id="limit-minimal" />
                <Label htmlFor="limit-minimal" className="font-normal cursor-pointer flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                  Minimale mögliche Leistung
                </Label>
              </div>
            </RadioGroup>

            {value.limit_type === "kw" && (
              <div className="pl-6 flex items-center gap-2">
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  max={maxPowerKw ?? undefined}
                  placeholder="z.B. 6"
                  value={value.limit_kw ?? ""}
                  onChange={(e) => set({ limit_kw: e.target.value ? parseFloat(e.target.value) : null })}
                  disabled={disabled}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">kW</span>
                {maxPowerKw && (
                  <span className="text-xs text-muted-foreground">(max. {maxPowerKw} kW)</span>
                )}
              </div>
            )}

            {value.limit_type === "minimal" && (
              <p className="pl-6 text-sm text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Der Ladepunkt lädt mit der geringstmöglichen Leistung (typischerweise 6 A / ~1,4 kW bei einphasig).
              </p>
            )}
          </div>

          {/* Save */}
          {!disabled && (
            <Button onClick={handleSave} disabled={isSaving} variant={saved ? "outline" : "default"} className="gap-1.5">
              {saved ? <><Check className="h-3.5 w-3.5" />Gespeichert</> : "Leistungsbegrenzung speichern"}
            </Button>
          )}
        </>
      )}

      {!value.enabled && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 pl-1">
          <Info className="h-3 w-3" />
          Aktivieren Sie die Leistungsbegrenzung, um Zeitfenster und Grenzwert zu konfigurieren.
        </p>
      )}
    </div>
  );
}
