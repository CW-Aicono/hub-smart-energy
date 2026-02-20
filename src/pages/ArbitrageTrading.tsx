import { useState } from "react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { useTranslation } from "@/hooks/useTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TrendingUp, TrendingDown, Battery, Zap, Plus, Trash2, Edit, BarChart3, Sun, Brain } from "lucide-react";
import { useEnergyStorages } from "@/hooks/useEnergyStorages";
import ArbitrageAiSuggestions from "@/components/charging/ArbitrageAiSuggestions";
import { useSpotPrices } from "@/hooks/useSpotPrices";
import { useArbitrageStrategies } from "@/hooks/useArbitrageStrategies";
import { useArbitrageTrades } from "@/hooks/useArbitrageTrades";
import { useLocations } from "@/hooks/useLocations";
import { usePvForecast, usePvForecastSettings } from "@/hooks/usePvForecast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from "recharts";
import { format, type Locale } from "date-fns";
import { de, enUS, es, nl } from "date-fns/locale";

const localeMap: Record<string, Locale> = { de, en: enUS, es, nl };

const ArbitrageTrading = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("nav.arbitrageTrading")}</h1>
          <p className="text-muted-foreground">Spotmarkt-Preise nutzen, Speicher steuern, Erlöse maximieren</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="storages">Speicher</TabsTrigger>
            <TabsTrigger value="strategies">Strategien</TabsTrigger>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="ai-strategy" className="gap-1"><Brain className="h-3 w-3" />KI-Empfehlungen</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><ArbitrageDashboard /></TabsContent>
          <TabsContent value="storages"><StoragesTab /></TabsContent>
          <TabsContent value="strategies"><StrategiesTab /></TabsContent>
          <TabsContent value="trades"><TradesTab /></TabsContent>
          <TabsContent value="ai-strategy"><ArbitrageAiSuggestions /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// ── Dashboard Tab ──
function ArbitrageDashboard() {
  const { t, language } = useTranslation();
  const { prices, currentPrice } = useSpotPrices();
  const { storages } = useEnergyStorages();
  const { totalRevenue, totalEnergy } = useArbitrageTrades();
  const { locations } = useLocations();
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  // Auto-select first location
  const effectiveLocationId = selectedLocationId || locations[0]?.id || null;
  const { forecast: pvForecast } = usePvForecast(effectiveLocationId);
  const { settings: pvSettings } = usePvForecastSettings(effectiveLocationId);
  const hasPv = !!pvSettings?.peak_power_kwp;
  const now = new Date();
  const startCutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const locale = localeMap[language] || de;

  const filteredPrices = prices.filter((p) => new Date(p.timestamp) >= startCutoff);

  const chartData = filteredPrices.map((p, i) => {
    const d = new Date(p.timestamp);
    // Match PV forecast hourly entry by timestamp
    const pvEntry = pvForecast?.hourly.find((h) => {
      const ht = new Date(h.timestamp);
      return ht.getHours() === d.getHours() && ht.toDateString() === d.toDateString();
    });
    const pvKwh = pvEntry ? (pvEntry.ai_adjusted_kwh ?? pvEntry.estimated_kwh) : undefined;
    return {
      idx: i,
      time: format(d, "HH:mm"),
      hour: d.getHours(),
      minute: d.getMinutes(),
      dateLabel: format(d, "EEEE dd.MM.", { locale }),
      price: Number(p.price_eur_mwh),
      pvKwh,
      _date: d.toDateString(),
      isPast: d < now,
    };
  });

  // Split into past / future segments for different styling
  const pastData = chartData.map((d) => ({ ...d, price: d.isPast ? d.price : undefined }));
  const futureData = chartData.map((d) => ({ ...d, price: !d.isPast ? d.price : undefined }));
  const transitionIdx = chartData.findIndex((d) => !d.isPast);
  if (transitionIdx > 0) {
    futureData[transitionIdx - 1] = { ...futureData[transitionIdx - 1], price: chartData[transitionIdx - 1].price };
  }

  // Find indices where the day changes
  const dayChangeIndices: number[] = [];
  for (let i = 1; i < chartData.length; i++) {
    if (chartData[i]._date !== chartData[i - 1]._date) {
      dayChangeIndices.push(i);
    }
  }

  // Build explicit tick indices: every 3h on full hours (00, 03, 06, …)
  const tickIndices: number[] = [];
  for (let i = 0; i < chartData.length; i++) {
    const e = chartData[i];
    if (e.minute === 0 && e.hour % 3 === 0) {
      tickIndices.push(i);
    }
  }
  // Always include first
  if (tickIndices.length === 0 || tickIndices[0] !== 0) tickIndices.unshift(0);
  // Do NOT add the last data point – it's rarely a full hour and gets clipped

  // Custom two-line tick: top = time, bottom = date (once per day)
  const renderCustomTick = (props: any) => {
    const { x, y, payload } = props;
    const dataIndex = payload?.value;
    const entry = chartData[dataIndex];
    if (!entry) return null;

    const isFirstOfDay =
      dataIndex === 0 ||
      entry._date !== chartData[dataIndex - 1]?._date;

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

  const activePvForecast = hasPv ? pvForecast : null;

  return (
    <div className="space-y-6">
      {/* Location Filter */}
      <div className="flex items-center gap-3">
        <Label className="whitespace-nowrap">Standort:</Label>
        <Select value={effectiveLocationId || ""} onValueChange={setSelectedLocationId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Standort wählen" /></SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Aktueller Spotpreis</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{priceCtKwh} ct/kWh</div>
            <p className="text-xs text-muted-foreground">{currentPrice ? `${Number(currentPrice.price_eur_mwh).toFixed(1)} €/MWh` : "Keine Daten"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Speicher registriert</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{storages.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gesamterlös</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-1">
              {totalRevenue >= 0 ? <TrendingUp className="h-5 w-5 text-green-500" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
              {totalRevenue.toFixed(2)} €
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gehandelte Energie</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalEnergy.toFixed(1)} kWh</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Spotpreis-Verlauf (48h)</CardTitle>
            {activePvForecast && (
              <Badge variant="secondary" className="gap-1">
                <Sun className="h-3 w-3" />
                PV-Prognose aktiv
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ left: 10, bottom: 20, right: activePvForecast ? 50 : 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="idx"
                  tick={renderCustomTick}
                  ticks={tickIndices}
                  height={45}
                  type="number"
                  domain={["dataMin", "dataMax"]}
                />
                <YAxis yAxisId="price" tick={{ fontSize: 12 }} label={{ value: "€/MWh", angle: -90, position: "insideLeft" }} />
                {activePvForecast && (
                  <YAxis yAxisId="pv" orientation="right" tick={{ fontSize: 12 }} label={{ value: "kWh", angle: 90, position: "insideRight" }} />
                )}
                <Tooltip
                  labelFormatter={(_val: string, payload: any[]) => {
                    if (payload?.[0]?.payload) {
                      const p = payload[0].payload;
                      return `${p.dateLabel} ${p.time}`;
                    }
                    return _val;
                  }}
                  formatter={(v: number, name: string) => {
                    if (name === "PV") return [`${v.toFixed(2)} kWh`, "PV-Erzeugung"];
                    return [`${v.toFixed(1)} €/MWh`, "Preis"];
                  }}
                />
                <ReferenceLine yAxisId="price" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                {dayChangeIndices.map((idx) => (
                  <ReferenceLine
                    key={`day-${idx}`}
                    x={idx}
                    yAxisId="price"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                ))}
                <Line yAxisId="price" data={pastData} type="monotone" dataKey="price" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="Vergangen" connectNulls={false} />
                <Line yAxisId="price" type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Preis" data={futureData} connectNulls={false} />
                {activePvForecast && (
                  <Area yAxisId="pv" type="monotone" dataKey="pvKwh" stroke="hsl(45, 93%, 47%)" fill="hsl(45, 93%, 47%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} name="PV" connectNulls={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-12">Noch keine Spotpreis-Daten vorhanden. Die Edge Function „fetch-spot-prices" lädt Daten automatisch.</p>
          )}
        </CardContent>
      </Card>

      {/* PV Recommendation */}
      {activePvForecast && activePvForecast.summary.ai_notes && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              PV-gestützte Empfehlung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Heute: <strong>{activePvForecast.summary.today_total_kwh.toFixed(0)} kWh</strong> prognostiziert
              {activePvForecast.summary.peak_hour && (
                <> · Spitze um <strong>{activePvForecast.summary.peak_hour.slice(11, 16)} Uhr</strong> ({activePvForecast.summary.peak_kwh.toFixed(1)} kW)</>
              )}
            </p>
            {activePvForecast.summary.ai_notes && (
              <p className="text-sm text-muted-foreground mt-1">{activePvForecast.summary.ai_notes}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Storages Tab ──
function StoragesTab() {
  const { storages, isLoading, createStorage, updateStorage, deleteStorage } = useEnergyStorages();
  const { locations } = useLocations();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = { name: "", location_id: "", capacity_kwh: 100, max_charge_kw: 50, max_discharge_kw: 50, efficiency_pct: 90 };
  const [form, setForm] = useState(emptyForm);

  const openEdit = (s: any) => {
    setForm({ name: s.name, location_id: s.location_id || "", capacity_kwh: s.capacity_kwh, max_charge_kw: s.max_charge_kw, max_discharge_kw: s.max_discharge_kw, efficiency_pct: s.efficiency_pct });
    setEditId(s.id);
    setOpen(true);
  };

  const handleSave = () => {
    if (editId) {
      updateStorage.mutate({ id: editId, ...form, location_id: form.location_id || undefined } as any, { onSuccess: () => { setOpen(false); setEditId(null); setForm(emptyForm); } });
    } else {
      createStorage.mutate({ ...form, location_id: form.location_id || undefined }, { onSuccess: () => { setOpen(false); setForm(emptyForm); } });
    }
  };

  const handleOpenChange = (v: boolean) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } };

  const storageForm = (
    <div className="space-y-3">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Standort</Label>
        <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
          <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Kapazität (kWh)</Label><Input type="number" value={form.capacity_kwh} onChange={(e) => setForm({ ...form, capacity_kwh: Number(e.target.value) })} /></div>
        <div><Label>Wirkungsgrad (%)</Label><Input type="number" value={form.efficiency_pct} onChange={(e) => setForm({ ...form, efficiency_pct: Number(e.target.value) })} /></div>
        <div><Label>Max Laden (kW)</Label><Input type="number" value={form.max_charge_kw} onChange={(e) => setForm({ ...form, max_charge_kw: Number(e.target.value) })} /></div>
        <div><Label>Max Entladen (kW)</Label><Input type="number" value={form.max_discharge_kw} onChange={(e) => setForm({ ...form, max_discharge_kw: Number(e.target.value) })} /></div>
      </div>
      <Button onClick={handleSave} disabled={!form.name || createStorage.isPending || updateStorage.isPending} className="w-full">{editId ? "Änderungen speichern" : "Speichern"}</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Batteriespeicher</h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Speicher anlegen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Speicher bearbeiten" : "Neuer Speicher"}</DialogTitle></DialogHeader>
            {storageForm}
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Standort</TableHead><TableHead>Kapazität</TableHead><TableHead>Laden/Entladen</TableHead><TableHead>η</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {storages.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium"><Battery className="inline h-4 w-4 mr-1" />{s.name}</TableCell>
              <TableCell>{(s as any).locations?.name || "–"}</TableCell>
              <TableCell>{s.capacity_kwh} kWh</TableCell>
              <TableCell>{s.max_charge_kw}/{s.max_discharge_kw} kW</TableCell>
              <TableCell>{s.efficiency_pct}%</TableCell>
              <TableCell><Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge></TableCell>
              <TableCell className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => deleteStorage.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {storages.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Noch keine Speicher angelegt</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Strategies Tab ──
function StrategiesTab() {
  const { strategies, createStrategy, updateStrategy, deleteStrategy } = useArbitrageStrategies();
  const { storages } = useEnergyStorages();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const emptyForm = { name: "", storage_id: "", buy_below_eur_mwh: 30, sell_above_eur_mwh: 80 };
  const [form, setForm] = useState(emptyForm);

  const openEdit = (s: any) => {
    setForm({ name: s.name, storage_id: s.storage_id, buy_below_eur_mwh: s.buy_below_eur_mwh, sell_above_eur_mwh: s.sell_above_eur_mwh });
    setEditId(s.id);
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.storage_id) return;
    if (editId) {
      updateStrategy.mutate({ id: editId, name: form.name, buy_below_eur_mwh: form.buy_below_eur_mwh, sell_above_eur_mwh: form.sell_above_eur_mwh }, { onSuccess: () => { setOpen(false); setEditId(null); setForm(emptyForm); } });
    } else {
      createStrategy.mutate(form, { onSuccess: () => { setOpen(false); setForm(emptyForm); } });
    }
  };

  const handleOpenChange = (v: boolean) => { setOpen(v); if (!v) { setEditId(null); setForm(emptyForm); } };

  const strategyForm = (
    <div className="space-y-3">
      <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>Speicher</Label>
        <Select value={form.storage_id} onValueChange={(v) => setForm({ ...form, storage_id: v })} disabled={!!editId}>
          <SelectTrigger><SelectValue placeholder="Speicher wählen" /></SelectTrigger>
          <SelectContent>{storages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Kaufen unter (€/MWh)</Label><Input type="number" value={form.buy_below_eur_mwh} onChange={(e) => setForm({ ...form, buy_below_eur_mwh: Number(e.target.value) })} /></div>
        <div><Label>Verkaufen über (€/MWh)</Label><Input type="number" value={form.sell_above_eur_mwh} onChange={(e) => setForm({ ...form, sell_above_eur_mwh: Number(e.target.value) })} /></div>
      </div>
      <Button onClick={handleSave} disabled={createStrategy.isPending || updateStrategy.isPending} className="w-full">{editId ? "Änderungen speichern" : "Speichern"}</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Handelsstrategien</h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Strategie anlegen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Strategie bearbeiten" : "Neue Strategie"}</DialogTitle></DialogHeader>
            {strategyForm}
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Speicher</TableHead><TableHead>Kaufen unter</TableHead><TableHead>Verkaufen über</TableHead><TableHead>Aktiv</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {strategies.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>{(s as any).energy_storages?.name || "–"}</TableCell>
              <TableCell>{s.buy_below_eur_mwh} €/MWh ({(Number(s.buy_below_eur_mwh) / 10).toFixed(1)} ct/kWh)</TableCell>
              <TableCell>{s.sell_above_eur_mwh} €/MWh ({(Number(s.sell_above_eur_mwh) / 10).toFixed(1)} ct/kWh)</TableCell>
              <TableCell>
                <Switch checked={s.is_active} onCheckedChange={(v) => updateStrategy.mutate({ id: s.id, is_active: v })} />
              </TableCell>
              <TableCell className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => deleteStrategy.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
          {strategies.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Noch keine Strategien angelegt</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Trades Tab ──
function TradesTab() {
  const { trades, totalRevenue } = useArbitrageTrades();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Handelshistorie</h2>
        <Badge variant={totalRevenue >= 0 ? "default" : "destructive"}>Gesamt: {totalRevenue.toFixed(2)} €</Badge>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Zeitpunkt</TableHead><TableHead>Typ</TableHead><TableHead>Speicher</TableHead><TableHead>Energie</TableHead><TableHead>Preis</TableHead><TableHead>Erlös</TableHead></TableRow></TableHeader>
        <TableBody>
          {trades.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{format(new Date(t.timestamp), "dd.MM.yyyy HH:mm")}</TableCell>
              <TableCell><Badge variant={t.trade_type === "charge" ? "secondary" : "default"}>{t.trade_type === "charge" ? "Laden" : "Entladen"}</Badge></TableCell>
              <TableCell>{(t as any).energy_storages?.name || "–"}</TableCell>
              <TableCell>{Number(t.energy_kwh).toFixed(1)} kWh</TableCell>
              <TableCell>{Number(t.price_eur_mwh).toFixed(1)} €/MWh</TableCell>
              <TableCell className={Number(t.revenue_eur) >= 0 ? "text-green-600" : "text-destructive"}>{Number(t.revenue_eur).toFixed(2)} €</TableCell>
            </TableRow>
          ))}
          {trades.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Noch keine Trades vorhanden</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

export default ArbitrageTrading;
