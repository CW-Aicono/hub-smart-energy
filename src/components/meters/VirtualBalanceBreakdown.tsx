import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { FlaskConical, PlugZap, Gauge, Users, MapPin, Equal, Plus, Minus } from "lucide-react";
import type { Meter } from "@/hooks/useMeters";
import { useVirtualBalance, type BalanceSourceRow } from "@/hooks/useVirtualBalance";
import { useSimulationMeterControl } from "@/hooks/useSimulationMeter";

function SimSlider({ meter }: { meter: Meter }) {
  const min = Number(meter.sim_min ?? -100);
  const max = Number(meter.sim_max ?? 100);
  const step = Number(meter.sim_step ?? 0.1);
  const { value, setValue } = useSimulationMeterControl(meter.id);
  const v = value ?? Number(meter.sim_default_value ?? 0);
  return (
    <div className="w-40 shrink-0">
      <Slider value={[v]} min={min} max={max} step={step} onValueChange={(arr) => setValue(arr[0])} />
    </div>
  );
}

function kindIcon(row: BalanceSourceRow) {
  switch (row.kind) {
    case "sim":
      return <FlaskConical className="h-3.5 w-3.5 text-amber-600" />;
    case "charge_point":
      return <PlugZap className="h-3.5 w-3.5 text-muted-foreground" />;
    case "charge_point_group":
      return <Users className="h-3.5 w-3.5 text-muted-foreground" />;
    case "all_charge_points":
      return <MapPin className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <Gauge className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

interface Props {
  meter: Meter;
  allMeters: Meter[];
}

export function VirtualBalanceBreakdown({ meter, allMeters }: Props) {
  const { rows, total, loading, hasSimSources } = useVirtualBalance({ meter, allMeters });
  const totalLabel =
    total == null ? "—" : `${total.toLocaleString("de-DE", { maximumFractionDigits: 2 })} kW`;
  const totalColor = total == null ? "text-muted-foreground" : total < 0 ? "text-emerald-600" : "text-blue-600";
  const totalHint = total == null ? "" : total < 0 ? "Einspeisung / Überschuss" : "Netzbezug";

  const simMeterById = new Map(allMeters.filter((m) => m.capture_type === "simulation").map((m) => [m.id, m]));

  return (
    <Card className={hasSimSources ? "border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20" : ""}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Equal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Live-Bilanz · {meter.name}</span>
          {hasSimSources && (
            <Badge variant="outline" className="bg-amber-500 text-white border-amber-600 text-[10px]">
              <FlaskConical className="h-3 w-3 mr-1" />
              TEST
            </Badge>
          )}
        </div>

        {loading && rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Lade Bilanz…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Keine Quellen konfiguriert. Bitte zuerst die Formel im Zähler-Editor festlegen.
          </p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((row) => {
              const v = row.valueKw;
              const display =
                v == null ? "—" : `${v.toLocaleString("de-DE", { maximumFractionDigits: 2 })} kW`;
              const signed =
                v == null
                  ? "—"
                  : `${row.sign === "-" ? "−" : "+"}${Math.abs(v).toLocaleString("de-DE", { maximumFractionDigits: 2 })} kW`;
              return (
                <div
                  key={row.key}
                  className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-xs">
                    {row.sign === "-" ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  </span>
                  {kindIcon(row)}
                  <span className="flex-1 truncate">{row.label}</span>
                  {row.kind === "sim" && row.simMeterId && simMeterById.has(row.simMeterId) && (
                    <SimSlider meter={simMeterById.get(row.simMeterId)!} />
                  )}
                  <span className="tabular-nums text-muted-foreground text-xs w-20 text-right">{display}</span>
                  <span className="tabular-nums w-24 text-right text-xs font-medium">{signed}</span>
                </div>
              );
            })}

            <div className="flex items-center gap-2 rounded-md border-2 border-dashed bg-muted/30 px-2 py-2 mt-1">
              <Equal className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium flex-1">Netz (berechnet)</span>
              <div className="text-right">
                <div className={`text-lg font-semibold tabular-nums ${totalColor}`}>{totalLabel}</div>
                {totalHint && <div className="text-[10px] text-muted-foreground">{totalHint}</div>}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
