import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { subDays, isAfter, format } from "date-fns";
import { de } from "date-fns/locale";
import { fmtNum, normalizeConnectorStatus } from "@/lib/formatCharging";
import { useTranslation } from "@/hooks/useTranslation";
import type { ChargePoint } from "@/hooks/useChargePoints";
import type { ChargingSession } from "@/hooks/useChargingSessions";

interface Props {
  chargePoints: ChargePoint[];
  sessions: ChargingSession[];
}

export default function ChargingOverviewStats({ chargePoints, sessions }: Props) {
  const [period, setPeriod] = useState("7");
  const { t } = useTranslation();

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

  const uptimePercent = chargePoints.length > 0
    ? (chargePoints.filter((cp) => {
        const s = normalizeConnectorStatus(cp.status, (cp as any).ws_connected !== false);
        return s === "available" || s === "charging";
      }).length / chargePoints.length * 100)
    : 0;

  const chartData = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const days: { day: string; available: number; charging: number; offline: number; error: number }[] = [];

    for (let i = periodDays - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const dayLabel = format(d, "EEE", { locale: de });
      const dateStr = format(d, "yyyy-MM-dd");
      const isToday = dateStr === today;
      const dayEnd = isToday ? new Date() : new Date(dateStr + "T23:59:59.999");

      // Nur Ladepunkte berücksichtigen, die an diesem Tag bereits existierten.
      const activeCps = chargePoints.filter((cp) => {
        const created = (cp as any).created_at ? new Date((cp as any).created_at) : null;
        return !created || created <= dayEnd;
      });
      const cpCount = activeCps.length;

      if (cpCount === 0) { days.push({ day: dayLabel, available: 0, charging: 0, offline: 0, error: 0 }); continue; }

      const daySessions = periodSessions.filter(
        (s) => format(new Date(s.start_time), "yyyy-MM-dd") === dateStr
              && activeCps.some((cp) => cp.id === s.charge_point_id),
      );

      const hoursInDay = isToday ? new Date().getHours() + (new Date().getMinutes() / 60) : 24;
      const totalHours = cpCount * hoursInDay;

      const chargingHours = Math.min(totalHours, daySessions.reduce((sum, s) => {
        const start = new Date(s.start_time);
        const end = s.stop_time ? new Date(s.stop_time) : new Date();
        const dayStart = new Date(dateStr + "T00:00:00");
        const effectiveStart = start < dayStart ? dayStart : start;
        const effectiveEnd = end > dayEnd ? dayEnd : end;
        if (effectiveEnd <= effectiveStart) return sum;
        return sum + (effectiveEnd.getTime() - effectiveStart.getTime()) / 3600000;
      }, 0));

      // Approximate: project current status onto all days (no historic status log)
      let errorCpCount = 0;
      let offlineCpCount = 0;
      for (const cp of activeCps) {
        const s = normalizeConnectorStatus(cp.status, (cp as any).ws_connected !== false);
        if (s === "faulted") errorCpCount++;
        else if (s === "offline") offlineCpCount++;
      }
      const errorHours = errorCpCount * hoursInDay;
      const offlineHours = offlineCpCount * hoursInDay;

      const availableHours = Math.max(0, totalHours - chargingHours - errorHours - offlineHours);
      days.push({
        day: dayLabel,
        available: totalHours > 0 ? (availableHours / totalHours) * 100 : 0,
        charging: totalHours > 0 ? (chargingHours / totalHours) * 100 : 0,
        offline: totalHours > 0 ? (offlineHours / totalHours) * 100 : 0,
        error: totalHours > 0 ? (errorHours / totalHours) * 100 : 0,
      });
    }
    return days;
  }, [periodSessions, periodDays, chargePoints]);


  const statusLabel = (key: string) => {
    if (key === "available") return t("cos.available" as any);
    if (key === "charging") return t("cos.charging" as any);
    if (key === "offline") return "Offline";
    return t("cos.error" as any);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          {t("cos.title" as any)}
        </CardTitle>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("cos.lastWeek" as any)}</SelectItem>
            <SelectItem value="30">{t("cos.lastMonth" as any)}</SelectItem>
            <SelectItem value="90">{t("cos.lastQuarter" as any)}</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{t("cos.totalKwh" as any)}</p>
            <p className="text-xl font-bold">{fmtNum(totalKwh)}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{t("cos.sessions" as any)}</p>
            <p className="text-xl font-bold">{sessionCount}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{t("cos.successRate" as any)}</p>
            <p className="text-xl font-bold">{fmtNum(successRate, 0)} %</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{t("cos.uptime" as any)}</p>
            <p className="text-xl font-bold">{fmtNum(uptimePercent, 2)} %</p>
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis hide />
              <Tooltip
                formatter={(value: number, name: string) => [`${value.toFixed(1)} %`, statusLabel(name)]}
              />
              <Legend formatter={(value: string) => statusLabel(value)} />
              <Bar dataKey="available" stackId="a" fill="hsl(152, 55%, 42%)" />
              <Bar dataKey="charging" stackId="a" fill="hsl(210, 90%, 55%)" />
              <Bar dataKey="offline" stackId="a" fill="hsl(30, 95%, 55%)" />
              <Bar dataKey="error" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
