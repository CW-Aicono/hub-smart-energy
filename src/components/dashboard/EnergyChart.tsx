import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { energyConsumptionData } from "@/data/mockData";
import { useLocations } from "@/hooks/useLocations";

interface EnergyChartProps {
  locationId: string | null;
}

const EnergyChart = ({ locationId }: EnergyChartProps) => {
  const { locations } = useLocations();
  const selectedLocation = locationId ? locations.find((l) => l.id === locationId) : null;
  
  // In a real implementation, filter data by locationId
  // For now, show all data or indicate the filter is active
  const subtitle = selectedLocation 
    ? `Daten für: ${selectedLocation.name}` 
    : "Alle Liegenschaften";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Energieverbrauch (kWh)</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={energyConsumptionData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" className="text-xs fill-muted-foreground" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
                color: 'hsl(var(--card-foreground))',
              }}
            />
            <Legend />
            <Bar dataKey="strom" name="Strom" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
            <Bar dataKey="gas" name="Gas" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
            <Bar dataKey="waerme" name="Wärme" fill="hsl(var(--chart-5))" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default EnergyChart;
