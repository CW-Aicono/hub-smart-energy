import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useEnergyData } from "@/hooks/useEnergyData";
import { useLocations } from "@/hooks/useLocations";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnergy } from "@/lib/formatEnergy";
import { ENERGY_CHART_COLORS } from "@/lib/energyTypeColors";

interface EnergyChartProps {
  locationId: string | null;
}

function getEnergyScale(maxValue: number): { divisor: number; unit: string } {
  if (maxValue > 9999) return { divisor: 1_000, unit: "MWh" };
  if (maxValue > 999) return { divisor: 1, unit: "kWh" };
  return { divisor: 0.001, unit: "Wh" };
}

const EnergyChart = ({ locationId }: EnergyChartProps) => {
  const { locations } = useLocations();
  const { monthlyData, loading, hasData } = useEnergyData(locationId);
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  
  const subtitle = selectedLocation 
    ? `Daten für: ${selectedLocation.name}` 
    : "Alle Liegenschaften";

  // Determine dynamic unit based on max value across all energy types
  const { scaledData, unit } = useMemo(() => {
    const maxVal = monthlyData.reduce((max, d) => {
      const vals = [d.strom || 0, d.gas || 0, d.waerme || 0];
      return Math.max(max, ...vals);
    }, 0);

    const scale = getEnergyScale(maxVal);

    const scaled = monthlyData.map((d) => ({
      ...d,
      strom: d.strom ? d.strom / scale.divisor : 0,
      gas: d.gas ? d.gas / scale.divisor : 0,
      waerme: d.waerme ? d.waerme / scale.divisor : 0,
    }));

    return { scaledData: scaled, unit: scale.unit };
  }, [monthlyData]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[300px]" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Energieverbrauch ({unit})</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Noch keine Verbrauchsdaten vorhanden
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scaledData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(var(--card-foreground))',
                }}
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${unit}`,
                  name,
                ]}
              />
              <Legend />
              <Bar dataKey="strom" name="Strom" fill={ENERGY_CHART_COLORS.strom} radius={[2, 2, 0, 0]} />
              <Bar dataKey="gas" name="Gas" fill={ENERGY_CHART_COLORS.gas} radius={[2, 2, 0, 0]} />
              <Bar dataKey="waerme" name="Wärme" fill={ENERGY_CHART_COLORS.waerme} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default EnergyChart;
