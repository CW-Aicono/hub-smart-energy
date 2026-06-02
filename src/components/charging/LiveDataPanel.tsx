import { Activity, Gauge, Zap, Clock } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { OcppLiveData } from "@/hooks/useOcppLiveData";

interface Props {
  live: OcppLiveData;
}

const nf1 = (v: number | null | undefined, digits = 1) =>
  v == null || Number.isNaN(v) ? "—" : v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function LiveDataPanel({ live }: Props) {
  const phases = Array.from(new Set([
    ...Object.keys(live.voltageByPhase),
    ...Object.keys(live.currentByPhase),
  ])).sort();

  const hasAny =
    live.powerW != null ||
    live.energyKwh != null ||
    phases.length > 0;

  if (live.loading) {
    return <p className="text-xs text-muted-foreground">Lade Live-Daten…</p>;
  }
  if (!hasAny) {
    return (
      <p className="text-xs text-muted-foreground">
        Noch keine Live-Daten empfangen. Die Wallbox sendet aktuell nur den Zählerstand. „Messgrößen prüfen" und anschließend „Live-Daten aktivieren" anstoßen.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3.5 w-3.5" /> Leistung
        </div>
        <div className="font-medium tabular-nums text-right">
          {live.powerW == null ? "—" : `${nf1(live.powerW / 1000, 2)} kW`}
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" /> Zählerstand
        </div>
        <div className="font-medium tabular-nums text-right">
          {live.energyKwh == null ? "—" : `${nf1(live.energyKwh, 2)} kWh`}
        </div>

        {phases.map((p) => (
          <div key={`row-${p}`} className="contents">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> {p}
            </div>
            <div className="font-medium tabular-nums text-right">
              {live.voltageByPhase[p] != null ? `${nf1(live.voltageByPhase[p], 0)} V` : "—"}
              {" · "}
              {live.currentByPhase[p] != null ? `${nf1(live.currentByPhase[p], 1)} A` : "—"}
            </div>
          </div>
        ))}
      </div>

      {live.latestAt && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t border-border/50">
          <Clock className="h-3 w-3" /> Aktualisiert: {format(new Date(live.latestAt), "dd.MM.yyyy HH:mm:ss", { locale: de })}
        </div>
      )}
    </div>
  );
}
