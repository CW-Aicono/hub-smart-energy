import { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSimulationMeterControl } from "@/hooks/useSimulationMeter";
import type { Meter } from "@/hooks/useMeters";
import { FlaskConical, Square } from "lucide-react";

interface SimulationMeterControlProps {
  meter: Meter;
  /** kompakter Modus für Listen/Kacheln */
  compact?: boolean;
}

export function SimulationMeterControl({ meter, compact = false }: SimulationMeterControlProps) {
  const min = Number(meter.sim_min ?? -100);
  const max = Number(meter.sim_max ?? 100);
  const step = Number(meter.sim_step ?? 0.1);
  const unit = meter.sim_unit || meter.unit || "";
  const bidi = !!meter.sim_bidirectional;

  const { value, loaded, setValue } = useSimulationMeterControl(meter.id);
  const [localValue, setLocalValue] = useState<number>(value ?? Number(meter.sim_default_value ?? 0));
  const [inputText, setInputText] = useState<string>(String(localValue));

  // Sync external (realtime) updates into local state when user is not dragging
  useEffect(() => {
    if (value != null) {
      setLocalValue(value);
      setInputText(value.toLocaleString("de-DE", { maximumFractionDigits: 3 }));
    }
  }, [value]);

  const handleSliderChange = (v: number[]) => {
    const next = v[0];
    setLocalValue(next);
    setInputText(next.toLocaleString("de-DE", { maximumFractionDigits: 3 }));
    setValue(next);
  };

  const setExact = (next: number) => {
    const clamped = Math.max(min, Math.min(max, next));
    setLocalValue(clamped);
    setInputText(clamped.toLocaleString("de-DE", { maximumFractionDigits: 3 }));
    setValue(clamped);
  };

  const handleInputCommit = () => {
    const parsed = parseFloat(inputText.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(parsed)) setExact(parsed);
    else setInputText(localValue.toLocaleString("de-DE", { maximumFractionDigits: 3 }));
  };

  const range = max - min;
  const pct = (p: number) => min + (range * p) / 100;

  return (
    <Card className={compact ? "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20" : "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20"}>
      <CardContent className={compact ? "p-3 space-y-2" : "p-4 space-y-3"}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="bg-amber-500 text-white border-amber-600 shrink-0">
              <FlaskConical className="h-3 w-3 mr-1" />
              TEST
            </Badge>
            <span className="text-xs text-muted-foreground truncate">
              Slider-Wert · keine Speicherung
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => setExact(0)}
            title="Auf 0 setzen"
          >
            <Square className="h-3 w-3 mr-1" /> Stop
          </Button>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {localValue.toLocaleString("de-DE", { maximumFractionDigits: step < 1 ? 2 : 0 })}
          </span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          {!loaded && <span className="text-xs text-muted-foreground">(laden…)</span>}
        </div>

        <Slider
          value={[localValue]}
          min={min}
          max={max}
          step={step}
          onValueChange={handleSliderChange}
        />

        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {min.toLocaleString("de-DE")} {unit}
          </span>
          <span>
            {max.toLocaleString("de-DE")} {unit}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setExact(min)}>
            Min
          </Button>
          {bidi && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setExact(pct(25))}>
              −50%
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setExact(0)}>
            0
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setExact(pct(bidi ? 75 : 50))}>
            50%
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setExact(max)}>
            Max
          </Button>
          <div className="flex items-center gap-1 ml-auto">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onBlur={handleInputCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="h-7 w-24 text-xs"
            />
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
