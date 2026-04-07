import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSpotPrices } from "@/hooks/useSpotPrices";
import { useTranslation } from "@/hooks/useTranslation";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, type Locale } from "date-fns";
import { de, enUS, es, nl } from "date-fns/locale";

const localeMap: Record<string, Locale> = { de, en: enUS, es, nl };

interface SpotPriceWidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
}

const SpotPriceWidget = ({ locationId }: SpotPriceWidgetProps) => {
  const { prices, isLoading, currentPrice } = useSpotPrices();
  const { language, t } = useTranslation();
  const T = (key: string) => t(key as any);

  const now = new Date();
  const startCutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const locale = localeMap[language] || de;

  const { chartData, pastData, futureData, dayChangeIndices, tickIndices } = useMemo(() => {
    const filtered = prices.filter((p) => new Date(p.timestamp) >= startCutoff);

    const cd = filtered.map((p, i) => {
      const d = new Date(p.timestamp);
      return {
        idx: i,
        time: format(d, "HH:mm"),
        hour: d.getHours(),
        minute: d.getMinutes(),
        dateLabel: format(d, "EEEE dd.MM.", { locale }),
        price: Number(p.price_eur_mwh),
        _date: d.toDateString(),
        isPast: d < now,
      };
    });

    const past = cd.map((d) => ({ ...d, price: d.isPast ? d.price : undefined }));
    const future = cd.map((d) => ({ ...d, price: !d.isPast ? d.price : undefined }));
    const transIdx = cd.findIndex((d) => !d.isPast);
    if (transIdx > 0) {
      future[transIdx - 1] = { ...future[transIdx - 1], price: cd[transIdx - 1].price };
    }

    const dayChanges: number[] = [];
    for (let i = 1; i < cd.length; i++) {
      if (cd[i]._date !== cd[i - 1]._date) dayChanges.push(i);
    }

    const ticks: number[] = [];
    for (let i = 0; i < cd.length; i++) {
      if (cd[i].minute === 0 && cd[i].hour % 3 === 0) ticks.push(i);
    }
    if (ticks.length === 0 || ticks[0] !== 0) ticks.unshift(0);

    return { chartData: cd, pastData: past, futureData: future, dayChangeIndices: dayChanges, tickIndices: ticks };
  }, [prices, locale]);

  const renderCustomTick = (props: any) => {
    const { x, y, payload } = props;
    const entry = chartData[payload?.value];
    if (!entry) return null;

    const isFirstOfDay = payload.value === 0 || entry._date !== chartData[payload.value - 1]?._date;

    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={11} fill="hsl(var(--foreground))">
          {entry.time}
        </text>
        {isFirstOfDay && (
          <text x={0} y={0} dy={26} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">
            {entry.dateLabel}
          </text>
        )}
      </g>
    );
  };

  const priceCtKwh = currentPrice ? (Number(currentPrice.price_eur_mwh) / 10).toFixed(2) : "–";

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="font-display text-lg flex items-center gap-2">{T("dashboard.spotPriceTitle")} <HelpTooltip text={T("tooltip.spotPrice")} /></CardTitle></CardHeader>
        <CardContent><Skeleton className="h-[260px]" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-2">{T("dashboard.spotPriceTitle")} <HelpTooltip text={T("tooltip.spotPrice")} /></CardTitle>
          <div className="text-right">
            <div className="text-lg font-bold">{priceCtKwh} ct/kWh</div>
            {currentPrice && (
              <div className="text-xs text-muted-foreground">{T("spot.current")}: {Number(currentPrice.price_eur_mwh).toFixed(1)} €/MWh</div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ left: 10, bottom: 20, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="idx"
                tick={renderCustomTick}
                ticks={tickIndices}
                height={45}
                type="number"
                domain={["dataMin", "dataMax"]}
              />
              <YAxis tick={{ fontSize: 12 }} label={{ value: "€/MWh", angle: -90, position: "insideLeft" }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0]?.payload;
                  if (!entry) return null;

                  // Find the valid price entry; prefer future over past at transition
                  const futureEntry = payload.find((p: any) => p.name === T("spot.price") && p.value != null);
                  const pastEntry = payload.find((p: any) => p.name === T("spot.past") && p.value != null);
                  const chosen = futureEntry || pastEntry;
                  if (!chosen || chosen.value == null) return null;

                  const isFuture = chosen === futureEntry;
                  return (
                    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 shadow-xl text-xs">
                      <p className="text-muted-foreground mb-1">{entry.dateLabel} {entry.time}</p>
                      <p className="font-medium" style={{ color: isFuture ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                        {Number(chosen.value).toFixed(1)} €/MWh
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              {dayChangeIndices.map((idx) => (
                <ReferenceLine
                  key={`day-${idx}`}
                  x={idx}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              ))}
              <Line data={pastData} type="stepAfter" dataKey="price" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name={T("spot.past")} connectNulls={false} />
              <Line type="stepAfter" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name={T("spot.price")} data={futureData} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-center py-12">{T("spot.noData")}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default SpotPriceWidget;
