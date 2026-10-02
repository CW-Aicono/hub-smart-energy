import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit3, TrendingUp, Calendar, Euro, Zap } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { calcRoi, type RoiSessionInput } from "@/lib/charging/roi";
import { useChargePointEconomics } from "@/hooks/useChargePointEconomics";

const fmtCur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${m}/${y.slice(2)}`;
};

interface Props {
  chargePointId: string;
  sessions: RoiSessionInput[];
  defaultSalePriceEurPerKwh: number;
  isLoading?: boolean;
}

export function RoiCard({ chargePointId, sessions, defaultSalePriceEurPerKwh, isLoading }: Props) {
  const { economics, isLoading: ecoLoading, upsert } = useChargePointEconomics(chargePointId);
  const [open, setOpen] = useState(false);

  const kpis = useMemo(() => {
    return calcRoi({
      capex_cents: economics?.capex_cents ?? 0,
      opex_monthly_cents: economics?.opex_monthly_cents ?? 0,
      commissioned_on: economics?.commissioned_on ?? null,
      electricity_cost_eur_per_kwh: economics?.electricity_cost_eur_per_kwh ?? 0.3,
      sale_price_eur_per_kwh: defaultSalePriceEurPerKwh,
      sessions,
    });
  }, [economics, sessions, defaultSalePriceEurPerKwh]);

  const chartData = kpis.monthlySeries.map((m) => ({
    month: fmtMonth(m.month),
    cum: m.cumulativeCents / 100,
  }));

  const configured = !!economics?.commissioned_on && (economics?.capex_cents ?? 0) > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Wirtschaftlichkeit (ROI)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Verkaufspreis-Annahme: {defaultSalePriceEurPerKwh.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kWh
          </p>
        </div>
        <EditDialog
          open={open}
          setOpen={setOpen}
          initial={economics}
          onSave={(v) => upsert.mutate(v, { onSuccess: () => setOpen(false) })}
        />
      </CardHeader>
      <CardContent>
        {ecoLoading || isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !configured ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Noch keine Wirtschaftlichkeitsdaten hinterlegt.
            <br />
            <Button variant="link" size="sm" onClick={() => setOpen(true)}>
              Investition & Inbetriebnahme erfassen
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Kpi
                icon={<Euro className="h-4 w-4 text-primary" />}
                label="Kumulierter Cashflow"
                value={fmtCur(kpis.cumulativeCashflowCents)}
                positive={kpis.cumulativeCashflowCents >= 0}
              />
              <Kpi
                icon={<Zap className="h-4 w-4 text-primary" />}
                label="Energie gesamt"
                value={`${kpis.totalKwh.toLocaleString("de-DE", { maximumFractionDigits: 0 })} kWh`}
              />
              <Kpi
                icon={<TrendingUp className="h-4 w-4 text-primary" />}
                label="Ø Netto / Monat (letzte 6)"
                value={fmtCur(kpis.avgMonthlyNetCents)}
                positive={kpis.avgMonthlyNetCents >= 0}
              />
              <Kpi
                icon={<Calendar className="h-4 w-4 text-primary" />}
                label="Amortisation"
                value={
                  kpis.paybackDate
                    ? kpis.paybackDate.toLocaleDateString("de-DE", { month: "2-digit", year: "numeric" })
                    : "—"
                }
              />
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="roiFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.toLocaleString("de-DE", { maximumFractionDigits: 0 }) + " €"}
                    width={70}
                  />
                  <RTooltip
                    formatter={(v: number) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                    labelFormatter={(l) => `Monat ${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="cum"
                    stroke="hsl(var(--primary))"
                    fill="url(#roiFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ icon, label, value, positive }: { icon: React.ReactNode; label: string; value: string; positive?: boolean }) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`text-lg font-semibold mt-1 ${positive === false ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function EditDialog({
  open,
  setOpen,
  initial,
  onSave,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  initial: any;
  onSave: (v: any) => void;
}) {
  const [capex, setCapex] = useState(((initial?.capex_cents ?? 0) / 100).toString());
  const [opex, setOpex] = useState(((initial?.opex_monthly_cents ?? 0) / 100).toString());
  const [date, setDate] = useState(initial?.commissioned_on ?? "");
  const [price, setPrice] = useState((initial?.electricity_cost_eur_per_kwh ?? 0.3).toString());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Edit3 className="h-3.5 w-3.5 mr-1" /> Bearbeiten</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Wirtschaftlichkeitsdaten</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Investition (inkl. Installation, €)</Label>
            <Input type="number" value={capex} onChange={(e) => setCapex(e.target.value)} />
          </div>
          <div>
            <Label>Monatliche Betriebskosten (€)</Label>
            <Input type="number" value={opex} onChange={(e) => setOpex(e.target.value)} />
          </div>
          <div>
            <Label>Inbetriebnahmedatum</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Einkaufs-Strompreis (€/kWh)</Label>
            <Input type="number" step="0.0001" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button
            onClick={() =>
              onSave({
                capex_cents: Math.round(parseFloat(capex || "0") * 100),
                opex_monthly_cents: Math.round(parseFloat(opex || "0") * 100),
                commissioned_on: date || null,
                electricity_cost_eur_per_kwh: parseFloat(price || "0.3"),
              })
            }
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
