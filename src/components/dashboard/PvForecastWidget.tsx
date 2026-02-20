import { usePvForecast } from "@/hooks/usePvForecast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sun, CloudSun, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface PvForecastWidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const PvForecastWidget = ({ locationId }: PvForecastWidgetProps) => {
  const { forecast, isLoading } = usePvForecast(locationId);

  if (!locationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" />PV-Prognose</CardTitle>
        </CardHeader>
        <CardContent><p className="text-muted-foreground text-sm">Bitte wählen Sie einen Standort aus.</p></CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" />PV-Prognose</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sun className="h-5 w-5 text-amber-500" />PV-Prognose</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground text-sm">Keine Prognosedaten verfügbar. Konfigurieren Sie PV-Einstellungen in der Liegenschaft.</p></CardContent>
      </Card>
    );
  }

  const { summary, hourly } = forecast;

  // Current estimated power
  const now = new Date();
  const currentEntry = hourly.find((h) => {
    const t = new Date(h.timestamp);
    return t.getTime() <= now.getTime() && now.getTime() < t.getTime() + 3600000;
  });
  const currentKw = currentEntry ? (currentEntry.ai_adjusted_kwh ?? currentEntry.estimated_kwh) : 0;

  // Chart data – every 2nd hour for compactness
  const chartData = hourly
    .filter((_, i) => i % 2 === 0)
    .map((h) => ({
      time: h.timestamp.slice(11, 16),
      kwh: h.ai_adjusted_kwh ?? h.estimated_kwh,
      cloud: h.cloud_cover_pct,
    }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sun className="h-5 w-5 text-amber-500" />
            PV-Prognose
          </CardTitle>
          {summary.ai_confidence && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              KI: {summary.ai_confidence}
            </Badge>
          )}
        </div>
        <CardDescription>{forecast.location.name}{forecast.location.city ? ` · ${forecast.location.city}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Jetzt</p>
            <p className="text-xl font-bold text-amber-600">{currentKw.toFixed(1)} kW</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Heute</p>
            <p className="text-xl font-bold">{summary.today_total_kwh.toFixed(0)} kWh</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Morgen</p>
            <p className="text-xl font-bold">{summary.tomorrow_total_kwh.toFixed(0)} kWh</p>
          </div>
        </div>

        {/* Bar chart */}
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ left: -10, right: 0 }}>
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={35} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(2)} kWh`, "Erzeugung"]}
              labelFormatter={(l) => `${l} Uhr`}
            />
            <Bar dataKey="kwh" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.cloud > 70 ? "hsl(var(--muted-foreground))" : "hsl(45, 93%, 47%)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* AI note */}
        {summary.ai_notes && (
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <CloudSun className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {summary.ai_notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PvForecastWidget;
