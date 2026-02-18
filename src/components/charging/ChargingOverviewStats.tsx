import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { subDays, isAfter, format } from "date-fns";
import { de } from "date-fns/locale";
import { fmtNum } from "@/lib/formatCharging";
import type { ChargePoint } from "@/hooks/useChargePoints";
import type { ChargingSession } from "@/hooks/useChargingSessions";

interface Props {
  chargePoints: ChargePoint[];
  sessions: ChargingSession[];
}

export default function ChargingOverviewStats({ chargePoints, sessions }: Props) {
  const [period, setPeriod] = useState("7");

  const periodDays = parseInt(period);
  const cutoff = subDays(new Date(), periodDays);
  const periodSessions = useMemo(
    () => sessions.filter((s) => isAfter(new Date(s.start_time), cutoff)),
    [sessions, cutoff.toISOString().slice(0, 10)]
  );

  const totalKwh = periodSessions.reduce((sum, s) => sum + s.energy_kwh, 0);
  const sessionCount = periodSessions.length;
  const successRate = sessionCount > 0
    ? (periodSessions.filter((s) => s.status === "completed" || s.energy_kwh > 0).length / sessionCount * 100)
    : 0;

  // Uptime: fraction of charge points that are NOT faulted/offline
  const uptimePercent = chargePoints.length > 0
    ? (chargePoints.filter((cp) => cp.status === "available" || cp.status === "charging").length / chargePoints.length * 100)
    : 0;

  const chartData = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const days: { day: string; available: number; charging: number; error: number }[] = [];

    for (let i = periodDays - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dayLabel = format(d, "EEE", { locale: de });
      const dateStr = format(d, "yyyy-MM-dd");
      const isToday = dateStr === today;

      const daySessions = periodSessions.filter(
        (s) => format(new Date(s.start_time), "yyyy-MM-dd") === dateStr
      );

      const cpCount = chargePoints.length;
      if (cpCount === 0) {
        days.push({ day: dayLabel, available: 0, charging: 0, error: 0 });
        continue;
      }

      const hoursInDay = isToday ? new Date().getHours() + (new Date().getMinutes() / 60) : 24;
      const totalHours = cpCount * hoursInDay;

      const chargingHours = Math.min(totalHours, daySessions.reduce((sum, s) => {
        const start = new Date(s.start_time);
        const end = s.stop_time ? new Date(s.stop_time) : new Date();
        // Clamp session duration to this day only
        const dayStart = new Date(dateStr + "T00:00:00");
        const dayEnd = isToday ? new Date() : new Date(dateStr + "T23:59:59.999");
        const effectiveStart = start < dayStart ? dayStart : start;
        const effectiveEnd = end > dayEnd ? dayEnd : end;
        if (effectiveEnd <= effectiveStart) return sum;
        return sum + (effectiveEnd.getTime() - effectiveStart.getTime()) / 3600000;
      }, 0));

      // Only count error hours for currently faulted charge points (live status as best available proxy)
      // Past days without sessions are still counted as "available", not empty.
      const errorHours = isToday
        ? chargePoints.filter((cp) => cp.status === "faulted").length * hoursInDay
        : 0;

      days.push({
        day: dayLabel,
        available: Math.max(0, totalHours - chargingHours - errorHours),
        charging: chargingHours,
        error: errorHours,
      });
    }
    return days;
  }, [periodSessions, periodDays, chargePoints]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Statistiken
        </CardTitle>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Letzte Woche</SelectItem>
            <SelectItem value="30">Letzter Monat</SelectItem>
            <SelectItem value="90">Letztes Quartal</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">kWh gesamt</p>
            <p className="text-xl font-bold">{fmtNum(totalKwh)}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Ladevorgänge</p>
            <p className="text-xl font-bold">{sessionCount}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Erfolgreiche Ladevorgänge</p>
            <p className="text-xl font-bold">{fmtNum(successRate, 0)} %</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Betriebszeit</p>
            <p className="text-xl font-bold">{fmtNum(uptimePercent, 2)} %</p>
          </div>
        </div>

        {/* Stacked bar chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis hide />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toFixed(1)} h`,
                  name === "available" ? "Verfügbar" : name === "charging" ? "Belegt" : "Fehler",
                ]}
              />
              <Legend
                formatter={(value: string) =>
                  value === "available" ? "Verfügbar" : value === "charging" ? "Belegt" : "Fehler"
                }
              />
              <Bar dataKey="available" stackId="a" fill="hsl(var(--primary))" />
              <Bar dataKey="charging" stackId="a" fill="hsl(var(--chart-4))" />
              <Bar dataKey="error" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
