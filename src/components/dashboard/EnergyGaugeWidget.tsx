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

/** Returns the power unit for a given energy type */
function getPowerUnit(energyType: string): string {
  return energyType === "wasser" || energyType === "gas" ? "m³/h" : "kW";
}

/** Picks an appropriate max scale for the gauge */
function autoScale(value: number, peak: number): number {
  const ref = Math.max(value, peak, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(ref)));
  const normalized = ref / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Single analog gauge rendered as SVG */
function AnalogGauge({ data }: { data: GaugeData }) {
  const { currentValue, peakValue, maxScale, unit, label, color } = data;

  // Gauge arc from -135° to +135° (270° sweep)
  const startAngle = -135;
  const endAngle = 135;
  const sweep = endAngle - startAngle; // 270

  const cx = 100;
  const cy = 105;
  const r = 72;

  const valueAngle = startAngle + (Math.min(currentValue, maxScale) / maxScale) * sweep;
  const peakAngle = startAngle + (Math.min(peakValue, maxScale) / maxScale) * sweep;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // Arc path for the background
  const arcPoint = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(angle)),
    y: cy + radius * Math.sin(toRad(angle)),
  });

  const arcStart = arcPoint(startAngle, r);
  const arcEnd = arcPoint(endAngle, r);

  // Filled arc up to current value
  const valEnd = arcPoint(valueAngle, r);

  // Tick marks
  const numTicks = 10;
  const ticks = Array.from({ length: numTicks + 1 }, (_, i) => {
    const frac = i / numTicks;
    const angle = startAngle + frac * sweep;
    const inner = arcPoint(angle, r - 8);
    const outer = arcPoint(angle, r + 2);
    const labelPt = arcPoint(angle, r - 18);
    const tickVal = Math.round((frac * maxScale) * 10) / 10;
    // Show label for 0, mid, and max, plus quarters
    const showLabel = i % 2 === 0;
    return { inner, outer, labelPt, tickVal, showLabel, angle };
  });

  // Needle
  const needleLen = r - 14;
  const needleTip = arcPoint(valueAngle, needleLen);
  const needleBase1 = arcPoint(valueAngle + 90, 4);
  const needleBase2 = arcPoint(valueAngle - 90, 4);

  // Peak marker (triangle)
  const peakPt = arcPoint(peakAngle, r + 8);
  const peakPt1 = arcPoint(peakAngle - 3, r + 15);
  const peakPt2 = arcPoint(peakAngle + 3, r + 15);

  // Format the display value
  const displayValue = currentValue >= 1000
    ? (currentValue / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })
    : currentValue.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const displayUnit = currentValue >= 1000
    ? (unit === "kW" ? "MW" : unit === "m³/h" ? "×1000 m³/h" : unit)
    : unit;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 155" className="w-full max-w-[200px]">
        {/* Background arc */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 1 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* Filled arc (current value) */}
        {currentValue > 0 && (
          <path
            d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${valueAngle - startAngle > 180 ? 1 : 0} 1 ${valEnd.x} ${valEnd.y}`}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            style={{ transition: "all 0.8s ease-out" }}
          />
        )}
        {/* Tick marks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.inner.x} y1={t.inner.y}
              x2={t.outer.x} y2={t.outer.y}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={i % 5 === 0 ? 1.5 : 0.8}
              opacity={0.5}
            />
            {t.showLabel && (
              <text
                x={t.labelPt.x} y={t.labelPt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="hsl(var(--muted-foreground))"
                fontSize={8}
                fontWeight={400}
              >
                {t.tickVal >= 1000 ? `${Math.round(t.tickVal / 1000)}k` : t.tickVal}
              </text>
            )}
          </g>
        ))}
        {/* Peak marker (triangle pointing inward) */}
        {peakValue > 0 && (
          <polygon
            points={`${peakPt.x},${peakPt.y} ${peakPt1.x},${peakPt1.y} ${peakPt2.x},${peakPt2.y}`}
            fill="#ef4444"
            opacity={0.85}
          >
            <title>Tageshöchstwert: {peakValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {unit}</title>
          </polygon>
        )}
        {/* Needle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill="hsl(var(--foreground))"
          style={{ transition: "all 0.8s ease-out" }}
        />
        {/* Center circle */}
        <circle cx={cx} cy={cy} r={6} fill="hsl(var(--foreground))" />
        <circle cx={cx} cy={cy} r={3} fill="hsl(var(--background))" />
        {/* Value text */}
        <text x={cx} y={cy + 30} textAnchor="middle" fill="hsl(var(--foreground))" fontSize={16} fontWeight={700} fontFamily="monospace">
          {displayValue}
        </text>
        <text x={cx} y={cy + 42} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={9}>
          {displayUnit}
        </text>
      </svg>
      <span className="text-xs font-medium mt-[-4px]" style={{ color }}>{label}</span>
      {peakValue > 0 && (
        <span className="text-[10px] text-muted-foreground mt-0.5">
          Peak: {peakValue.toLocaleString("de-DE", { maximumFractionDigits: 1 })} {unit}
        </span>
      )}
    </div>
  );
}

const EnergyGaugeWidget = ({ locationId }: EnergyGaugeWidgetProps) => {
  const { meters } = useMeters();
  const allowedTypes = useLocationEnergySources(locationId);
  const [dailyPeaks, setDailyPeaks] = useState<Record<string, number>>({});

  // Get active auto main meters filtered by location
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

  // Integration IDs for sensor queries
  const integrationIds = useMemo(() => {
    const ids = new Set<string>();
    activeMeters.forEach((m) => {
      if (m.location_integration_id) ids.add(m.location_integration_id);
    });
    return Array.from(ids);
  }, [activeMeters]);

  const sensorQueries = useLoxoneSensorsMulti(integrationIds);

  // Fetch daily peak from meter_power_readings
  useEffect(() => {
    const fetchPeaks = async () => {
      const meterIds = activeMeters.map((m) => m.id);
      if (meterIds.length === 0) return;

      const today = new Date();
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();

      // Get max power per energy type from today's readings
      const { data, error } = await supabase
        .from("meter_power_readings")
        .select("meter_id, power_value")
        .in("meter_id", meterIds)
        .gte("recorded_at", dayStart)
        .lte("recorded_at", dayEnd)
        .order("power_value", { ascending: false });

      if (error || !data) return;

      // Group by energy type, find max per type
      const peaks: Record<string, number> = {};
      for (const row of data) {
        const meter = activeMeters.find((m) => m.id === row.meter_id);
        if (!meter) continue;
        const et = meter.energy_type;
        const current = peaks[et] ?? 0;
        // Sum across meters of same type if needed, but for peaks we take max per reading timestamp
        // For simplicity: track max individual reading per energy type
        if (row.power_value > current) peaks[et] = row.power_value;
      }
      setDailyPeaks(peaks);
    };

    fetchPeaks();
    const interval = setInterval(fetchPeaks, 60_000); // refresh peaks every minute
    return () => clearInterval(interval);
  }, [activeMeters]);

  // Build gauge data from live sensor values
  const gaugeData = useMemo((): GaugeData[] => {
    const sensorsByIntegration = new Map<string, any[]>();
    integrationIds.forEach((id, idx) => {
      const query = sensorQueries[idx];
      if (query?.data) sensorsByIntegration.set(id, query.data);
    });

    // Aggregate current power by energy type
    const currentByType: Record<string, number> = {};

    for (const meter of activeMeters) {
      const sensors = sensorsByIntegration.get(meter.location_integration_id!);
      if (!sensors) continue;
      const sensor = sensors.find((s: any) => s.id === meter.sensor_uuid);
      if (!sensor || sensor.rawValue == null) continue;

      const et = meter.energy_type;
      currentByType[et] = (currentByType[et] ?? 0) + Math.abs(sensor.rawValue);
    }

    // Build gauges for each active energy type
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
      <CardHeader>
        <CardTitle className="font-display text-lg">Live-Leistung</CardTitle>
        <p className="text-xs text-muted-foreground">Aktuelle Momentanwerte · <span className="text-red-500">▲</span> Tageshöchstwert</p>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-4 ${
          gaugeData.length === 1 ? "grid-cols-1 max-w-[220px] mx-auto" :
          gaugeData.length === 2 ? "grid-cols-2" :
          gaugeData.length === 3 ? "grid-cols-3" :
          "grid-cols-2 sm:grid-cols-4"
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
