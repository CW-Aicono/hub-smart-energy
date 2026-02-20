import { useMemo, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { useMeters } from "@/hooks/useMeters";
import { useLoxoneSensorsMulti } from "@/hooks/useLoxoneSensors";
import { useLocationEnergySources } from "@/hooks/useLocationEnergySources";
import { ENERGY_TYPE_LABELS, ENERGY_HEX_COLORS } from "@/lib/energyTypeColors";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay } from "date-fns";

interface EnergyGaugeWidgetProps {
  locationId: string | null;
}

interface GaugeData {
  energyType: string;
  label: string;
  currentValue: number;
  peakValue: number;
  maxScale: number;
  unit: string;
  color: string;
  hidePeak?: boolean;
}

function getPowerUnit(energyType: string): string {
  return energyType === "wasser" || energyType === "gas" ? "m³/h" : "kW";
}

function autoScale(value: number, peak: number): number {
  const ref = Math.max(value, peak, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(ref)));
  const normalized = ref / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Interpolate eco gradient color at a given fraction (0–1) along the arc */
function ecoColorAtFraction(frac: number): string {
  // Gradient stops: 0% = #ef4444 (red), 50% = #eab308 (yellow), 100% = #22c55e (green)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const hexToRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

  const red = hexToRgb("#ef4444");
  const yellow = hexToRgb("#eab308");
  const green = hexToRgb("#22c55e");

  let rgb: number[];
  if (frac <= 0.5) {
    const t = frac / 0.5;
    rgb = [lerp(red[0], yellow[0], t), lerp(red[1], yellow[1], t), lerp(red[2], yellow[2], t)];
  } else {
    const t = (frac - 0.5) / 0.5;
    rgb = [lerp(yellow[0], green[0], t), lerp(yellow[1], green[1], t), lerp(yellow[2], green[2], t)];
  }
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

function AnalogGauge({ data }: { data: GaugeData }) {
  const { currentValue, peakValue, maxScale, unit, label, color, hidePeak } = data;

  const startAngle = -225;
  const endAngle = 45;
  const sweep = endAngle - startAngle;

  // Use a viewBox with generous padding so glow filters don't clip
  const pad = 16;
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;

  const valueFrac = Math.min(currentValue, maxScale) / maxScale;
  const valueAngle = startAngle + valueFrac * sweep;
  const peakAngle = startAngle + (Math.min(peakValue, maxScale) / maxScale) * sweep;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPoint = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(angle)),
    y: cy + radius * Math.sin(toRad(angle)),
  });

  const arcStart = arcPoint(startAngle, r);
  const arcEnd = arcPoint(endAngle, r);
  const valEnd = arcPoint(valueAngle, r);

  const numTicks = 10;
  const ticks = Array.from({ length: numTicks + 1 }, (_, i) => {
    const frac = i / numTicks;
    const angle = startAngle + frac * sweep;
    const isMajor = i % 2 === 0;
    const inner = arcPoint(angle, r - (isMajor ? 11 : 6));
    const outer = arcPoint(angle, r);
    const labelPt = arcPoint(angle, r - 19);
    const tickVal = Math.round((frac * maxScale) * 100) / 100;
    return { inner, outer, labelPt, tickVal, isMajor };
  });

  const needleLen = r - 16;
  const needleTip = arcPoint(valueAngle, needleLen);
  const needleTail = arcPoint(valueAngle + 180, 12);
  const needleBase1 = arcPoint(valueAngle + 90, 2.5);
  const needleBase2 = arcPoint(valueAngle - 90, 2.5);

  const peakOuter = arcPoint(peakAngle, r + 2);
  const peakInner = arcPoint(peakAngle, r - 5);

  const displayValue = currentValue >= 1000
    ? (currentValue / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })
    : currentValue.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const displayUnit = currentValue >= 1000 ? (unit === "kW" ? "MW" : unit) : unit;

  const fmtTick = (v: number) => {
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    if (v === Math.floor(v)) return String(v);
    return v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  };

  const vbX = -pad;
  const vbY = -pad;
  const vbW = size + pad * 2;
  const vbH = size * 0.78 + pad * 2;

  return (
    <div className="flex flex-col items-center flex-1 min-w-[120px] max-w-[210px]">
      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="w-full">
        <defs>
          <filter id={`glow-${data.energyType}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={color} floodOpacity="0.45" />
          </filter>
          <linearGradient id={`needle-${data.energyType}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--foreground))" />
            <stop offset="100%" stopColor="hsl(var(--muted-foreground))" />
          </linearGradient>
          {/* Eco arc gradient: red (0%) → yellow (50%) → green (100%), mapped to arc direction */}
          {data.energyType === "eco" && (
            <>
              <linearGradient id="eco-arc-gradient" x1="0%" y1="100%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
              {/* Value gradient: same colors but end-stop = interpolated color at needle position */}
              <linearGradient id="eco-value-gradient" x1="0%" y1="100%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" />
                {valueFrac > 0.1 && <stop offset="50%" stopColor="#eab308" />}
                <stop offset="100%" stopColor={ecoColorAtFraction(valueFrac)} />
              </linearGradient>
            </>
          )}
        </defs>

        {/* Background arc */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 1 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke={data.energyType === "eco" ? "url(#eco-arc-gradient)" : "hsl(var(--border))"}
          strokeWidth={6} strokeLinecap="round"
          opacity={data.energyType === "eco" ? 0.2 : 0.35}
        />
        {/* Value arc */}
        {currentValue > 0 && (
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${valueAngle - startAngle > 180 ? 1 : 0} 1 ${valEnd.x} ${valEnd.y}`}
            fill="none"
            stroke={data.energyType === "eco" ? "url(#eco-value-gradient)" : color}
            strokeWidth={6} strokeLinecap="round"
            filter={`url(#glow-${data.energyType})`}
            style={{ transition: "all 1s cubic-bezier(0.4,0,0.2,1)" }}
          />
        )}

        {/* Ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.inner.x} y1={t.inner.y} x2={t.outer.x} y2={t.outer.y}
              stroke="hsl(var(--foreground))"
              strokeWidth={t.isMajor ? 1.4 : 0.6}
              opacity={t.isMajor ? 0.5 : 0.2}
            />
            {t.isMajor && (
              <text
                x={t.labelPt.x} y={t.labelPt.y}
                textAnchor="middle" dominantBaseline="middle"
                fill="hsl(var(--muted-foreground))" fontSize={8} fontWeight={500}
              >
                {fmtTick(t.tickVal)}
              </text>
            )}
          </g>
        ))}

        {/* Peak marker */}
        {!hidePeak && peakValue > 0 && (
          <line
            x1={peakInner.x} y1={peakInner.y} x2={peakOuter.x} y2={peakOuter.y}
            stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" opacity={0.85}
          >
            <title>Peak: {peakValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {unit}</title>
          </line>
        )}

        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleTail.x},${needleTail.y} ${needleBase2.x},${needleBase2.y}`}
          fill={`url(#needle-${data.energyType})`} opacity={0.9}
          style={{ transition: "all 1s cubic-bezier(0.4,0,0.2,1)" }}
        />

        {/* Hub */}
        <circle cx={cx} cy={cy} r={7} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={4} fill="hsl(var(--foreground))" opacity={0.6} />
        <circle cx={cx} cy={cy} r={1.8} fill="hsl(var(--background))" />

        {/* Readout */}
        <text x={cx} y={cy + 26} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={18} fontWeight={700} fontFamily="'SF Mono', 'Cascadia Code', monospace">
          {displayValue}
        </text>
        <text x={cx} y={cy + 38} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8} fontWeight={500}>
          {displayUnit}
        </text>
      </svg>
      <span className="text-sm font-semibold tracking-wide -mt-2" style={{ color }}>{label}</span>
      {!hidePeak && peakValue > 0 && (
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <span className="text-destructive">▲</span>
          {peakValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {unit}
        </span>
      )}
    </div>
  );
}

/** Compute a simple eco score 0–100 based on current power draw relative to daily peaks */
function computeEcoScore(
  gaugeData: GaugeData[]
): number {
  const energyGauges = gaugeData.filter((g) => !g.hidePeak);
  if (energyGauges.length === 0) return 100;

  let totalRatio = 0;
  let count = 0;
  for (const g of energyGauges) {
    const ref = Math.max(g.peakValue, g.maxScale * 0.5, 1);
    const ratio = Math.min(g.currentValue / ref, 1);
    totalRatio += ratio;
    count++;
  }

  // Lower usage = higher eco score
  const avgRatio = totalRatio / count;
  return Math.round((1 - avgRatio) * 100);
}

const EnergyGaugeWidget = ({ locationId }: EnergyGaugeWidgetProps) => {
  const { meters } = useMeters();
  const allowedTypes = useLocationEnergySources(locationId);
  const [dailyPeaks, setDailyPeaks] = useState<Record<string, number>>({});

  const activeMeters = useMemo(() => {
    return meters.filter(
      (m) =>
        !m.is_archived &&
        m.capture_type === "automatic" &&
        m.is_main_meter &&
        m.sensor_uuid &&
        m.location_integration_id &&
        (!locationId || m.location_id === locationId)
    );
  }, [meters, locationId]);

  const integrationIds = useMemo(() => {
    const ids = new Set<string>();
    activeMeters.forEach((m) => {
      if (m.location_integration_id) ids.add(m.location_integration_id);
    });
    return Array.from(ids);
  }, [activeMeters]);

  const sensorQueries = useLoxoneSensorsMulti(integrationIds);

  const fetchPeaks = useCallback(async () => {
    const meterIds = activeMeters.map((m) => m.id);
    if (meterIds.length === 0) return;
    const today = new Date();
    const { data, error } = await supabase
      .from("meter_power_readings")
      .select("meter_id, power_value")
      .in("meter_id", meterIds)
      .gte("recorded_at", startOfDay(today).toISOString())
      .lte("recorded_at", endOfDay(today).toISOString())
      .order("power_value", { ascending: false });
    if (error || !data) return;
    const peaks: Record<string, number> = {};
    for (const row of data) {
      const meter = activeMeters.find((m) => m.id === row.meter_id);
      if (!meter) continue;
      const et = meter.energy_type;
      if ((peaks[et] ?? 0) < row.power_value) peaks[et] = row.power_value;
    }
    setDailyPeaks(peaks);
  }, [activeMeters]);

  useEffect(() => {
    fetchPeaks();
    const interval = setInterval(fetchPeaks, 60_000);
    return () => clearInterval(interval);
  }, [fetchPeaks]);

  const handleResetPeaks = useCallback(() => setDailyPeaks({}), []);

  const gaugeData = useMemo((): GaugeData[] => {
    const sensorsByIntegration = new Map<string, any[]>();
    integrationIds.forEach((id, idx) => {
      const query = sensorQueries[idx];
      if (query?.data) sensorsByIntegration.set(id, query.data);
    });
    const currentByType: Record<string, number> = {};
    for (const meter of activeMeters) {
      const sensors = sensorsByIntegration.get(meter.location_integration_id!);
      if (!sensors) continue;
      const sensor = sensors.find((s: any) => s.id === meter.sensor_uuid);
      if (!sensor || sensor.rawValue == null) continue;
      const et = meter.energy_type;
      currentByType[et] = (currentByType[et] ?? 0) + Math.abs(sensor.rawValue);
    }
    const energyTypes = ["strom", "gas", "waerme", "wasser"].filter(
      (et) => allowedTypes.has(et) && (currentByType[et] != null || dailyPeaks[et] != null)
    );
    return energyTypes.map((et) => {
      const current = currentByType[et] ?? 0;
      const peak = dailyPeaks[et] ?? 0;
      return {
        energyType: et,
        label: ENERGY_TYPE_LABELS[et] || et,
        currentValue: Math.round(current * 10) / 10,
        peakValue: Math.round(peak * 10) / 10,
        maxScale: autoScale(current, peak),
        unit: getPowerUnit(et),
        color: ENERGY_HEX_COLORS[et] || "#888",
      };
    });
  }, [activeMeters, integrationIds, sensorQueries, allowedTypes, dailyPeaks]);

  const ecoScore = useMemo(() => computeEcoScore(gaugeData), [gaugeData]);

  const ecoGauge: GaugeData = {
    energyType: "eco",
    label: "Öko-Score",
    currentValue: ecoScore,
    peakValue: 0,
    maxScale: 100,
    unit: "%",
    color: ecoScore >= 70 ? "#22c55e" : ecoScore >= 40 ? "#eab308" : "#ef4444",
    hidePeak: true,
  };

  const isLoading = sensorQueries.some((q) => q.isLoading);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Live-Leistung</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-[200px]" /></CardContent>
      </Card>
    );
  }

  if (gaugeData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Live-Leistung</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            Keine aktiven automatischen Hauptzähler vorhanden
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasPeaks = Object.values(dailyPeaks).some((v) => v > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display text-lg">Live-Leistung</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aktuelle Momentanwerte · <span className="text-destructive">▲</span> Tageshöchstwert
            </p>
          </div>
          {hasPeaks && (
            <Button
              variant="ghost" size="sm"
              onClick={handleResetPeaks}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              title="Peak-Werte zurücksetzen"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Peak Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        <div className="
          rounded-[50px] border border-border/50
          bg-gradient-to-b from-background via-muted/20 to-muted/40
          shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-2px_6px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.08)]
          px-4 py-4
        ">
          <div className="flex items-start justify-around">
            {gaugeData.map((g) => (
              <AnalogGauge key={g.energyType} data={g} />
            ))}
            {/* Eco gauge always last */}
            <AnalogGauge data={ecoGauge} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergyGaugeWidget;
