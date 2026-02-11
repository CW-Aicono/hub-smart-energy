import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

interface PieChartWidgetProps {
  locationId: string | null;
}

const ENERGY_COLORS: Record<string, string> = {
  strom: "hsl(var(--energy-strom))",
  gas: "hsl(var(--energy-gas))",
  waerme: "hsl(var(--energy-waerme))",
  wasser: "hsl(var(--energy-wasser))",
};

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

const PieChartWidget = ({ locationId }: PieChartWidgetProps) => {
  const { locations } = useLocations();
  const { energyDistribution, loading, hasData } = useEnergyData(locationId);
  const { meters } = useMeters(locationId || undefined);
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  const subtitle = selectedLocation ? `Daten für: ${selectedLocation.name}` : "Alle Liegenschaften";

  // Determine which energy types have active meters configured
  const configuredTypes = useMemo(() => {
    const types = new Set<string>();
    meters.filter(m => !m.is_archived).forEach(m => types.add(m.energy_type));
    return types;
  }, [meters]);

  // Filter distribution to show all configured energy types (even if 0)
  const chartData = useMemo(() => {
    if (configuredTypes.size === 0) return energyDistribution.filter(d => d.value > 0);
    return energyDistribution.filter(d => {
      const key = Object.entries(ENERGY_LABELS).find(([, label]) => label === d.name)?.[0];
      return key && configuredTypes.has(key);
    });
  }, [energyDistribution, configuredTypes]);

  // For display: ensure at least a minimum visible slice for types with 0%
  const displayData = useMemo(() => {
    const hasNonZero = chartData.some(d => d.value > 0);
    if (!hasNonZero) return chartData;
    return chartData.map(d => ({
      ...d,
      displayValue: d.value === 0 ? 0.5 : d.value, // tiny slice for visibility
    }));
  }, [chartData]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[280px]" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">Energieverteilung</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] relative" style={{ zIndex: 0 }}>
          {displayData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Noch keine Verbrauchsdaten vorhanden
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={displayData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="displayValue"
                  nameKey="name"
                  animationBegin={0}
                  animationDuration={1200}
                  animationEasing="ease-out"
                >
                  {displayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="hsl(var(--background))" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    color: "hsl(var(--card-foreground))",
                  }}
                  formatter={(value: number, name: string, props: any) => {
                    const realValue = props?.payload?.value ?? value;
                    const totalValue = props?.payload?.totalValue ?? 0;
                    const unit = props?.payload?.unit ?? "kWh";
                    return [`${totalValue.toLocaleString("de-DE")} ${unit} · ${realValue}%`, name];
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => <span style={{ color: "hsl(var(--foreground))", fontSize: "12px" }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PieChartWidget;
