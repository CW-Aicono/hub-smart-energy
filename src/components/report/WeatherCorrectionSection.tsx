import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudSun } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useHeatingDegreeDays } from "@/hooks/useHeatingDegreeDays";
import {
  REFERENCE_HDD_GERMANY,
  isHeatType,
  normalizeHeatConsumption,
} from "@/lib/report/weatherCorrection";
import type { Location } from "@/hooks/useLocations";

interface WeatherCorrectionSectionProps {
  locations: Location[];
  consumption?: Record<number, Record<string, Record<string, number>>>;
  years: number[];
}

export function WeatherCorrectionSection({
  locations,
  consumption,
  years,
}: WeatherCorrectionSectionProps) {
  const { data: hddMap, isLoading } = useHeatingDegreeDays(
    locations.map((l) => ({ id: l.id, latitude: l.latitude, longitude: l.longitude })),
    years,
  );

  // Aggregierter Wärmeverbrauch pro Jahr (Ist vs. bereinigt)
  const data = years.map((y) => {
    let measured = 0;
    let normalized = 0;
    let hddSum = 0;
    let hddCount = 0;
    for (const loc of locations) {
      const cons = consumption?.[y]?.[loc.id];
      if (!cons) continue;
      const hdd = hddMap?.[loc.id]?.[y]?.hdd ?? REFERENCE_HDD_GERMANY;
      hddSum += hdd;
      hddCount++;
      for (const [eType, kwh] of Object.entries(cons)) {
        if (!isHeatType(eType)) continue;
        measured += kwh;
        normalized += normalizeHeatConsumption(kwh, hdd);
      }
    }
    return {
      year: String(y),
      Ist: Math.round(measured),
      Bereinigt: Math.round(normalized),
      HDD: hddCount > 0 ? Math.round(hddSum / hddCount) : REFERENCE_HDD_GERMANY,
    };
  });

  const hasData = data.some((d) => d.Ist > 0);

  return (
    <Card data-report-section="witterung">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudSun className="h-5 w-5" /> Witterungsbereinigung
        </CardTitle>
        <CardDescription>
          Heizgradtag-Verfahren (Basis 15 °C, Referenz {REFERENCE_HDD_GERMANY} Kd/a, DWD 1991–2020).
          Wetterdaten von Open-Meteo Archive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Lade Klimadaten…</p>}
        {!hasData && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Kein witterungsabhängiger Verbrauch (Wärme/Gas/Fernwärme) für die Auswahl vorhanden.
          </p>
        )}
        {hasData && (
          <>
            <div data-chart="weather-correction">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} unit=" kWh" />
                  <Tooltip
                    formatter={(v: number) => `${v.toLocaleString("de-DE")} kWh`}
                  />
                  <Legend />
                  <Bar dataKey="Ist" fill="hsl(15, 75%, 55%)" />
                  <Bar dataKey="Bereinigt" fill="hsl(210, 75%, 55%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Jahr</th>
                    <th className="text-right py-2">Ist-Verbrauch</th>
                    <th className="text-right py-2">Bereinigt</th>
                    <th className="text-right py-2">HDD</th>
                    <th className="text-right py-2">Korrektur</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => {
                    const factor = d.Ist > 0 ? d.Bereinigt / d.Ist : 1;
                    return (
                      <tr key={d.year} className="border-b">
                        <td className="py-2">{d.year}</td>
                        <td className="py-2 text-right">{d.Ist.toLocaleString("de-DE")} kWh</td>
                        <td className="py-2 text-right">{d.Bereinigt.toLocaleString("de-DE")} kWh</td>
                        <td className="py-2 text-right">{d.HDD} Kd</td>
                        <td className="py-2 text-right">
                          <Badge variant={factor > 1.05 ? "default" : factor < 0.95 ? "secondary" : "outline"}>
                            ×{factor.toFixed(2)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
