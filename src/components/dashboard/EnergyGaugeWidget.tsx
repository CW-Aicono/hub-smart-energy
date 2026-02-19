import { useMemo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Single automotive-style analog gauge */
function AnalogGauge({ data }: { data: GaugeData }) {
  const { currentValue, peakValue, maxScale, unit, label, color } = data;

  const startAngle = -225;
  const endAngle = 45;
  const sweep = endAngle - startAngle; // 270

  const cx = 120;
  const cy = 120;
  const r = 88;

  const valueAngle = startAngle + (Math.min(currentValue, maxScale) / maxScale) * sweep;
  const peakAngle = startAngle + (Math.min(peakValue, maxScale) / maxScale) * sweep;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPoint = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(angle)),
    y: cy + radius * Math.sin(toRad(angle)),
  });

  const arcStart = arcPoint(startAngle, r);
  const arcEnd = arcPoint(endAngle, r);
  const valEnd = arcPoint(valueAngle, r);

  // Tick marks — major every 1/5, minor every 1/10
  const numTicks = 10;
  const ticks = Array.from({ length: numTicks + 1 }, (_, i) => {
    const frac = i / numTicks;
    const angle = startAngle + frac * sweep;
    const isMajor = i % 2 === 0;
    const inner = arcPoint(angle, r - (isMajor ? 12 : 7));
    const outer = arcPoint(angle, r);
    const labelPt = arcPoint(angle, r - 22);
    const tickVal = Math.round((frac * maxScale) * 100) / 100;
    return { inner, outer, labelPt, tickVal, isMajor, angle };
  });

  // Needle
  const needleLen = r - 18;
  const needleTip = arcPoint(valueAngle, needleLen);
  const needleTail = arcPoint(valueAngle + 180, 14);
  const needleBase1 = arcPoint(valueAngle + 90, 3);
  const needleBase2 = arcPoint(valueAngle - 90, 3);

  // Peak marker
  const peakOuter = arcPoint(peakAngle, r + 4);
  const peakInner = arcPoint(peakAngle, r - 4);
  const peakL = arcPoint(peakAngle - 2.5, r + 4);
  const peakR = arcPoint(peakAngle + 2.5, r + 4);

  // Format display
  const displayValue = currentValue >= 1000
    ? (currentValue / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })
    : currentValue.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const displayUnit = currentValue >= 1000
    ? (unit === "kW" ? "MW" : unit)
    : unit;

  // Tick label formatter
  const fmtTick = (v: number) => {
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    if (v === Math.floor(v)) return String(v);
    return v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  };

  return (
    <div className="flex flex-col items-center px-1">
      {/* Dark cockpit bezel */}
      <div className="relative rounded-full bg-gradient-to-b from-[hsl(var(--muted)/0.6)] to-[hsl(var(--muted)/0.3)] p-[3px] shadow-[inset_0_2px_6px_rgba(0,0,0,0.15),0_1px_3px_rgba(0,0,0,0.1)]">
        <div className="rounded-full bg-gradient-to-b from-card to-card/95 shadow-inner">
          <svg viewBox="0 0 240 170" className="w-full max-w-[220px]" overflow="visible">
            {/* Subtle inner glow */}
            <defs>
              <radialGradient id={`glow-${data.energyType}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={color} stopOpacity={0.06} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </radialGradient>
              <filter id={`shadow-${data.energyType}`}>
                <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={color} floodOpacity="0.3" />
              </filter>
            </defs>
            <circle cx={cx} cy={cy} r={r + 8} fill={`url(#glow-${data.energyType})`} />

            {/* Background arc track */}
            <path
              d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 1 1 ${arcEnd.x} ${arcEnd.y}`}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={8}
              strokeLinecap="round"
              opacity={0.5}
            />
            {/* Value arc */}
            {currentValue > 0 && (
              <path
                d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${valueAngle - startAngle > 180 ? 1 : 0} 1 ${valEnd.x} ${valEnd.y}`}
                fill="none"
                stroke={color}
                strokeWidth={8}
                strokeLinecap="round"
                filter={`url(#shadow-${data.energyType})`}
                style={{ transition: "all 1s cubic-bezier(0.4,0,0.2,1)" }}
              />
            )}

            {/* Tick marks */}
            {ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={t.inner.x} y1={t.inner.y}
                  x2={t.outer.x} y2={t.outer.y}
                  stroke="hsl(var(--foreground))"
                  strokeWidth={t.isMajor ? 1.8 : 0.8}
                  opacity={t.isMajor ? 0.45 : 0.25}
                />
                {t.isMajor && (
                  <text
                    x={t.labelPt.x} y={t.labelPt.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="hsl(var(--muted-foreground))"
                    fontSize={9}
                    fontFamily="system-ui, sans-serif"
                    fontWeight={500}
                  >
                    {fmtTick(t.tickVal)}
                  </text>
                )}
              </g>
            ))}

            {/* Peak marker (red notch) */}
            {peakValue > 0 && (
              <g>
                <line
                  x1={peakInner.x} y1={peakInner.y}
                  x2={peakOuter.x} y2={peakOuter.y}
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  opacity={0.9}
                >
                  <title>Tageshöchstwert: {peakValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {unit}</title>
                </line>
              </g>
            )}

            {/* Needle with tail (automotive style) */}
            <g style={{ transition: "all 1s cubic-bezier(0.4,0,0.2,1)", transformOrigin: `${cx}px ${cy}px` }}>
              <polygon
                points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleTail.x},${needleTail.y} ${needleBase2.x},${needleBase2.y}`}
                fill="hsl(var(--foreground))"
                opacity={0.85}
                style={{ transition: "all 1s cubic-bezier(0.4,0,0.2,1)" }}
              />
            </g>

            {/* Center hub (layered metallic look) */}
            <circle cx={cx} cy={cy} r={10} fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth={1} />
            <circle cx={cx} cy={cy} r={6} fill="hsl(var(--foreground))" opacity={0.7} />
            <circle cx={cx} cy={cy} r={3} fill="hsl(var(--background))" />

            {/* Digital readout */}
            <text x={cx} y={cy + 34} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={22} fontWeight={700} fontFamily="'SF Mono', 'Cascadia Code', monospace">
              {displayValue}
            </text>
            <text x={cx} y={cy + 48} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={10} fontWeight={500}>
              {displayUnit}
            </text>
          </svg>
        </div>
      </div>
      {/* Label below bezel */}
      <span className="text-sm font-semibold mt-1.5 tracking-wide" style={{ color }}>{label}</span>
      {peakValue > 0 && (
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
          <span className="text-destructive">▲</span>
          {peakValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {unit}
        </span>
      )}
    </div>
  );
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

  useEffect(() => {
    const fetchPeaks = async () => {
      const meterIds = activeMeters.map((m) => m.id);
      if (meterIds.length === 0) return;

      const today = new Date();
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();

      const { data, error } = await supabase
        .from("meter_power_readings")
        .select("meter_id, power_value")
        .in("meter_id", meterIds)
        .gte("recorded_at", dayStart)
        .lte("recorded_at", dayEnd)
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
    };

    fetchPeaks();
    const interval = setInterval(fetchPeaks, 60_000);
    return () => clearInterval(interval);
  }, [activeMeters]);

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
      const maxScale = autoScale(current, peak);
      return {
        energyType: et,
        label: ENERGY_TYPE_LABELS[et] || et,
        currentValue: Math.round(current * 10) / 10,
        peakValue: Math.round(peak * 10) / 10,
        maxScale,
        unit: getPowerUnit(et),
        color: ENERGY_HEX_COLORS[et] || "#888",
      };
    });
  }, [activeMeters, integrationIds, sensorQueries, allowedTypes, dailyPeaks]);

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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">Live-Leistung</CardTitle>
        <p className="text-xs text-muted-foreground">Aktuelle Momentanwerte · <span className="text-destructive">▲</span> Tageshöchstwert</p>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        <div className={`flex items-start justify-center gap-6 flex-wrap ${
          gaugeData.length <= 2 ? "gap-10" : "gap-4"
        }`}>
          {gaugeData.map((g) => (
            <AnalogGauge key={g.energyType} data={g} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default EnergyGaugeWidget;
