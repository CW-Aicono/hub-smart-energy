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

const EnergyChart = ({ locationId }: EnergyChartProps) => {
  const { locations } = useLocations();
  const { monthlyData, loading, hasData } = useEnergyData(locationId);
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  
  const subtitle = selectedLocation 
    ? `Daten für: ${selectedLocation.name}` 
    : "Alle Liegenschaften";

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-[300px]" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Energieverbrauch (kWh)</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Noch keine Verbrauchsdaten vorhanden
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  color: 'hsl(var(--card-foreground))',
                }}
                formatter={(value: number, name: string) => [formatEnergy(value), name]}
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
