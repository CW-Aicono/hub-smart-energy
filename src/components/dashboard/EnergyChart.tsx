import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { energyConsumptionData } from "@/data/mockData";
import { useLocations } from "@/hooks/useLocations";
import { downloadCSV } from "@/lib/exportUtils";
import { Download } from "lucide-react";

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
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-display text-lg">Energieverbrauch (kWh)</CardTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCSV(
              energyConsumptionData.map((d) => ({ Monat: d.month, Strom: d.strom, Gas: d.gas, Wärme: d.waerme })),
              "energieverbrauch",
              { Monat: "Monat", Strom: "Strom (kWh)", Gas: "Gas (kWh)", Wärme: "Wärme (kWh)" }
            )
          }
        >
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
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
