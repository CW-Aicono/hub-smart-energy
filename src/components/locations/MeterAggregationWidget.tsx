import { useMemo, useState, useEffect, useCallback } from "react";
import { Meter } from "@/hooks/useMeters";
import { MeterReading } from "@/hooks/useMeterReadings";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Minus, Zap, Flame, Droplets, Thermometer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatEnergy } from "@/lib/formatEnergy";

interface MeterAggregationWidgetProps {
  meters: Meter[];
  readings: MeterReading[];
}

const ENERGY_ICONS: Record<string, React.ElementType> = {
  strom: Zap,
  gas: Flame,
  wasser: Droplets,
  waerme: Thermometer,
};

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

interface AggregationRow {
  parent: Meter;
  children: Meter[];
  parentValue: number | null;
  childrenSum: number | null;
  difference: number | null;
  coveragePercent: number | null;
}

function getLatestReading(meterId: string, readings: MeterReading[]): number | null {
  const meterReadings = readings
    .filter((r) => r.meter_id === meterId)
    .sort((a, b) => b.reading_date.localeCompare(a.reading_date));
  return meterReadings[0]?.value ?? null;
}

export const MeterAggregationWidget = ({ meters, readings }: MeterAggregationWidgetProps) => {
  const activeMeters = meters.filter((m) => !m.is_archived);
  const [liveValues, setLiveValues] = useState<Map<string, number>>(new Map());

  // Fetch live sensor values for automatic meters
  const fetchLiveValues = useCallback(async () => {
    const automaticMeters = activeMeters.filter(
      (m) => m.capture_type === "automatic" && m.sensor_uuid && m.location_integration_id
    );
    if (automaticMeters.length === 0) return;

    // Group by integration
    const byIntegration = new Map<string, Meter[]>();
    automaticMeters.forEach((m) => {
      const key = m.location_integration_id!;
      const existing = byIntegration.get(key) || [];
      existing.push(m);
      byIntegration.set(key, existing);
    });

    const newValues = new Map<string, number>();

    for (const [integrationId, intMeters] of byIntegration) {
      try {
        const { data, error } = await supabase.functions.invoke("loxone-api", {
          body: { locationIntegrationId: integrationId, action: "getSensors" },
        });
        if (error || !data?.success) continue;

        for (const meter of intMeters) {
          const sensor = data.sensors?.find((s: any) => s.id === meter.sensor_uuid);
          if (sensor && sensor.value !== undefined) {
            const numVal = typeof sensor.value === "string" ? parseFloat(sensor.value) : sensor.value;
            if (!isNaN(numVal)) {
              newValues.set(meter.id, numVal);
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch sensors for integration ${integrationId}:`, err);
      }
    }

    setLiveValues(newValues);
  }, [activeMeters]);

  useEffect(() => {
    fetchLiveValues();
    const interval = setInterval(fetchLiveValues, 300000); // 5 min
    return () => clearInterval(interval);
  }, [fetchLiveValues]);

  // Get value: prefer live for automatic meters, fall back to meter_readings
  const getMeterValue = useCallback(
    (meter: Meter): number | null => {
      if (meter.capture_type === "automatic" && liveValues.has(meter.id)) {
        return liveValues.get(meter.id)!;
      }
      return getLatestReading(meter.id, readings);
    },
    [liveValues, readings]
  );

  const aggregations = useMemo<AggregationRow[]>(() => {
    // Find meters that have children
    const parentIds = new Set(
      activeMeters
        .filter((m) => m.parent_meter_id)
        .map((m) => m.parent_meter_id!)
    );

    return Array.from(parentIds)
      .map((parentId) => {
        const parent = activeMeters.find((m) => m.id === parentId);
        if (!parent) return null;

        const children = activeMeters.filter((m) => m.parent_meter_id === parentId);
        const parentValue = getMeterValue(parent);

        const childValues = children.map((c) => getMeterValue(c));
        const hasAllChildValues = childValues.every((v) => v !== null);
        const childrenSum = hasAllChildValues
          ? childValues.reduce((sum, v) => sum! + v!, 0)
          : null;

        const difference =
          parentValue !== null && childrenSum !== null
            ? parentValue - childrenSum
            : null;

        const coveragePercent =
          parentValue !== null && parentValue > 0 && childrenSum !== null
            ? (childrenSum / parentValue) * 100
            : null;

        return { parent, children, parentValue, childrenSum, difference, coveragePercent };
      })
      .filter(Boolean) as AggregationRow[];
  }, [activeMeters, getMeterValue]);

  if (aggregations.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        Keine Summenzähler mit Unterzählern vorhanden. Ordnen Sie Zähler in der Zählerstruktur hierarchisch an.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {aggregations.map(({ parent, children, parentValue, childrenSum, difference, coveragePercent }) => {
        const EnergyIcon = ENERGY_ICONS[parent.energy_type] || Zap;
        const hasMismatch = difference !== null && Math.abs(difference) > 0.01;
        const isOvercount = difference !== null && difference < 0;
        const diffPercent = parentValue && difference !== null ? Math.abs(difference / parentValue) * 100 : 0;
        const isSignificant = diffPercent > 5;

        return (
          <Card key={parent.id} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2">
                <EnergyIcon className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium text-sm truncate">{parent.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {ENERGY_LABELS[parent.energy_type] || parent.energy_type}
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {children.length} Unterzähler
                </span>
              </div>

              {/* Values */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Summenzähler</p>
                  <p className="text-lg font-semibold">
                    {parentValue !== null ? parentValue.toLocaleString("de-DE") : "–"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{parent.unit}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Σ Unterzähler</p>
                  <p className="text-lg font-semibold">
                    {childrenSum !== null ? childrenSum.toLocaleString("de-DE") : "–"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{parent.unit}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Differenz</p>
                  <p className={`text-lg font-semibold ${
                    difference === null ? "" :
                    isSignificant ? "text-destructive" : "text-primary"
                  }`}>
                    {difference !== null ? (
                      <>
                        {difference > 0 ? "+" : ""}
                        {difference.toLocaleString("de-DE")}
                      </>
                    ) : "–"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{parent.unit}</p>
                </div>
              </div>

              {/* Coverage bar */}
              {coveragePercent !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Abdeckung durch Unterzähler</span>
                    <span className={`font-medium ${
                      coveragePercent > 105 || coveragePercent < 80 ? "text-destructive" : "text-primary"
                    }`}>
                      {coveragePercent.toFixed(1)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(coveragePercent, 100)}
                    className="h-2"
                  />
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-1.5 text-xs">
                {difference === null ? (
                  <>
                    <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Nicht alle Zählerstände vorhanden</span>
                  </>
                ) : isSignificant ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-destructive">
                      {isOvercount
                        ? "Unterzähler übersteigen Summenzähler"
                        : `${diffPercent.toFixed(1)}% nicht erfasst`}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Bilanz plausibel</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
