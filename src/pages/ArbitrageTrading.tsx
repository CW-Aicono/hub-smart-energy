import { useState, useEffect, useRef } from "react";
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
import { TrendingUp, TrendingDown, Battery, Zap, Plus, Trash2, Edit, BarChart3, Sun, Brain, Archive, Sparkles } from "lucide-react";
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
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("nav.arbitrageTrading")}</h1>
          <p className="text-muted-foreground">{t("arbitrage.subtitle" as any)}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="storages">{t("arbitrage.storages" as any)}</TabsTrigger>
            <TabsTrigger value="strategies">{t("arbitrage.strategies" as any)}</TabsTrigger>
            <TabsTrigger value="trades">{t("arbitrage.trades" as any)}</TabsTrigger>
            <TabsTrigger value="ai-strategy" className="gap-1"><Brain className="h-3 w-3" />{t("arbitrage.aiRecommendations" as any)}</TabsTrigger>
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

  const effectiveLocationId = selectedLocationId || locations[0]?.id || null;
  const { forecast: pvForecast } = usePvForecast(effectiveLocationId);
  const { settings: pvSettings } = usePvForecastSettings(effectiveLocationId);
  const hasPv = !!pvSettings?.is_active && !!pvSettings?.peak_power_kwp;
  const now = new Date();
  const startCutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const locale = localeMap[language] || de;

  const filteredPrices = prices.filter((p) => new Date(p.timestamp) >= startCutoff);

  const chartData = filteredPrices.map((p, i) => {
    const d = new Date(p.timestamp);
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

  const pastData = chartData.map((d) => ({ ...d, price: d.isPast ? d.price : undefined }));
  const futureData = chartData.map((d) => ({ ...d, price: !d.isPast ? d.price : undefined }));
  const transitionIdx = chartData.findIndex((d) => !d.isPast);
  if (transitionIdx > 0) {
    futureData[transitionIdx - 1] = { ...futureData[transitionIdx - 1], price: chartData[transitionIdx - 1].price };
  }

  const dayChangeIndices: number[] = [];
  for (let i = 1; i < chartData.length; i++) {
    if (chartData[i]._date !== chartData[i - 1]._date) {
      dayChangeIndices.push(i);
    }
  }

  const tickIndices: number[] = [];
  for (let i = 0; i < chartData.length; i++) {
    const e = chartData[i];
    if (e.minute === 0 && e.hour % 3 === 0) {
      tickIndices.push(i);
    }
  }
  if (tickIndices.length === 0 || tickIndices[0] !== 0) tickIndices.unshift(0);

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
        <Label className="whitespace-nowrap">{t("arbitrage.location" as any)}</Label>
        <Select value={effectiveLocationId || ""} onValueChange={setSelectedLocationId}>
          <SelectTrigger className="w-64"><SelectValue placeholder={t("arbitrage.selectLocation" as any)} /></SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t("arbitrage.currentSpotPrice" as any)}</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{priceCtKwh} ct/kWh</div>
            <p className="text-xs text-muted-foreground">{currentPrice ? `${Number(currentPrice.price_eur_mwh).toFixed(1)} €/MWh` : t("arbitrage.noData" as any)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t("arbitrage.registeredStorages" as any)}</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{storages.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t("arbitrage.totalRevenue" as any)}</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-1">
              {totalRevenue >= 0 ? <TrendingUp className="h-5 w-5 text-green-500" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
              {totalRevenue.toFixed(2)} €
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t("arbitrage.tradedEnergy" as any)}</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalEnergy.toFixed(1)} kWh</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("arbitrage.spotPriceChart" as any)}</CardTitle>
            <Badge variant="secondary" className={`gap-1 ${hasPv ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : ''}`}>
              <Sun className="h-3 w-3" />
              {hasPv ? t("arbitrage.pvForecastActive" as any) : t("arbitrage.pvForecastInactive" as any)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ left: 10, bottom: 20, right: activePvForecast ? 50 : 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="idx" tick={renderCustomTick} ticks={tickIndices} height={45} type="number" domain={["dataMin", "dataMax"]} />
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
                    if (name === "PV") return [`${v.toFixed(2)} kWh`, "PV"];
                    return [`${v.toFixed(1)} €/MWh`, t("arbitrage.price" as any)];
                  }}
                />
                <ReferenceLine yAxisId="price" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                {dayChangeIndices.map((idx) => (
                  <ReferenceLine key={`day-${idx}`} x={idx} yAxisId="price" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1} />
                ))}
                <Line yAxisId="price" data={pastData} type="stepAfter" dataKey="price" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} name="past" connectNulls={false} />
                <Line yAxisId="price" type="stepAfter" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name={t("arbitrage.price" as any)} data={futureData} connectNulls={false} />
                {activePvForecast && (
                  <Area yAxisId="pv" type="stepAfter" dataKey="pvKwh" stroke="hsl(45, 93%, 47%)" fill="hsl(45, 93%, 47%)" fillOpacity={0.15} strokeWidth={1.5} dot={false} name="PV" connectNulls={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-12">{t("arbitrage.noSpotData" as any)}</p>
          )}
        </CardContent>
      </Card>

      {/* PV Recommendation */}
      {activePvForecast && activePvForecast.summary.ai_notes && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              {t("arbitrage.pvRecommendation" as any)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {activePvForecast.summary.today_total_kwh.toFixed(0)} kWh
              {activePvForecast.summary.peak_hour && (
                <> · {activePvForecast.summary.peak_hour.slice(11, 16)} ({activePvForecast.summary.peak_kwh.toFixed(1)} kW)</>
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
  const { t } = useTranslation();
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
      <div><Label>{t("charging.name" as any)}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>{t("charging.location" as any)}</Label>
        <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
          <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("arbitrage.capacity" as any)}</Label><Input type="number" value={form.capacity_kwh} onChange={(e) => setForm({ ...form, capacity_kwh: Number(e.target.value) })} /></div>
        <div><Label>{t("arbitrage.efficiency" as any)}</Label><Input type="number" value={form.efficiency_pct} onChange={(e) => setForm({ ...form, efficiency_pct: Number(e.target.value) })} /></div>
        <div><Label>{t("arbitrage.maxCharge" as any)}</Label><Input type="number" value={form.max_charge_kw} onChange={(e) => setForm({ ...form, max_charge_kw: Number(e.target.value) })} /></div>
        <div><Label>{t("arbitrage.maxDischarge" as any)}</Label><Input type="number" value={form.max_discharge_kw} onChange={(e) => setForm({ ...form, max_discharge_kw: Number(e.target.value) })} /></div>
      </div>
      <Button onClick={handleSave} disabled={!form.name || createStorage.isPending || updateStorage.isPending} className="w-full">{editId ? t("common.save" as any) : t("common.save" as any)}</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{t("arbitrage.batteryStorages" as any)}</h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t("arbitrage.addStorage" as any)}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? t("arbitrage.editStorage" as any) : t("arbitrage.newStorage" as any)}</DialogTitle></DialogHeader>
            {storageForm}
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>{t("charging.name" as any)}</TableHead><TableHead>{t("charging.location" as any)}</TableHead><TableHead>{t("arbitrage.capacity" as any)}</TableHead><TableHead>{t("arbitrage.chargeDischarge" as any)}</TableHead><TableHead>η</TableHead><TableHead>{t("common.status" as any)}</TableHead><TableHead></TableHead></TableRow></TableHeader>
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
          {storages.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("arbitrage.noStorages" as any)}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Strategies Tab ──
function StrategiesTab() {
  const { t } = useTranslation();
  const { activeStrategies, archivedStrategies, createStrategy, updateStrategy, deleteStrategy, archiveStrategy } = useArbitrageStrategies();
  const { storages } = useEnergyStorages();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const emptyForm = { name: "", storage_id: "", buy_below_eur_mwh: 30, sell_above_eur_mwh: 80 };
  const [form, setForm] = useState(emptyForm);

  const archivedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Date();
    activeStrategies.forEach((s: any) => {
      if (s.source === "ai" && s.valid_until && new Date(s.valid_until) < now && !archivedRef.current.has(s.id)) {
        archivedRef.current.add(s.id);
        archiveStrategy.mutate(s.id);
      }
    });
  }, [activeStrategies]);

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
      <div><Label>{t("charging.name" as any)}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><Label>{t("arbitrage.storages" as any)}</Label>
        <Select value={form.storage_id} onValueChange={(v) => setForm({ ...form, storage_id: v })} disabled={!!editId}>
          <SelectTrigger><SelectValue placeholder={t("arbitrage.selectStorage" as any)} /></SelectTrigger>
          <SelectContent>{storages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("arbitrage.buyBelow" as any)}</Label><Input type="number" value={form.buy_below_eur_mwh} onChange={(e) => setForm({ ...form, buy_below_eur_mwh: Number(e.target.value) })} /></div>
        <div><Label>{t("arbitrage.sellAbove" as any)}</Label><Input type="number" value={form.sell_above_eur_mwh} onChange={(e) => setForm({ ...form, sell_above_eur_mwh: Number(e.target.value) })} /></div>
      </div>
      <Button onClick={handleSave} disabled={createStrategy.isPending || updateStrategy.isPending} className="w-full">{editId ? t("common.save" as any) : t("common.save" as any)}</Button>
    </div>
  );

  const renderStrategyRow = (s: any, isArchived = false) => (
    <TableRow key={s.id} className={isArchived ? "opacity-60" : ""}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {s.name}
          {s.source === "ai" && (
            <Badge variant="secondary" className="gap-1 bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 text-xs">
              <Sparkles className="h-3 w-3" />
              AI
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{s.energy_storages?.name || "–"}</TableCell>
      <TableCell>{s.buy_below_eur_mwh} €/MWh ({(Number(s.buy_below_eur_mwh) / 10).toFixed(1)} ct/kWh)</TableCell>
      <TableCell>{s.sell_above_eur_mwh} €/MWh ({(Number(s.sell_above_eur_mwh) / 10).toFixed(1)} ct/kWh)</TableCell>
      <TableCell>
        {isArchived ? (
          <Badge variant="outline" className="text-muted-foreground"><Archive className="h-3 w-3 mr-1" />{t("arbitrage.archived" as any)}</Badge>
        ) : (
          <Switch checked={s.is_active} onCheckedChange={(v) => updateStrategy.mutate({ id: s.id, is_active: v })} />
        )}
      </TableCell>
      <TableCell className="flex gap-1">
        {!isArchived && s.source !== "ai" && (
          <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
        )}
        {!isArchived && s.source === "ai" && (
          <Button variant="ghost" size="icon" title={t("arbitrage.archived" as any)} onClick={() => archiveStrategy.mutate(s.id)}><Archive className="h-4 w-4" /></Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => deleteStrategy.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{t("arbitrage.tradingStrategies" as any)}</h2>
        <div className="flex gap-2">
          {archivedStrategies.length > 0 && (
            <Button variant="outline" onClick={() => setShowArchive(!showArchive)}>
              <Archive className="h-4 w-4 mr-2" />
              {t("meters.archive" as any)} ({archivedStrategies.length})
            </Button>
          )}
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t("arbitrage.addStrategy" as any)}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? t("arbitrage.editStrategy" as any) : t("arbitrage.newStrategy" as any)}</DialogTitle></DialogHeader>
              {strategyForm}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Table>
        <TableHeader><TableRow><TableHead>{t("charging.name" as any)}</TableHead><TableHead>{t("arbitrage.storages" as any)}</TableHead><TableHead>{t("arbitrage.buyBelow" as any)}</TableHead><TableHead>{t("arbitrage.sellAbove" as any)}</TableHead><TableHead>{t("common.active" as any)}</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {activeStrategies.map((s) => renderStrategyRow(s))}
          {activeStrategies.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("arbitrage.noStrategies" as any)}</TableCell></TableRow>}
        </TableBody>
      </Table>

      {showArchive && archivedStrategies.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1"><Archive className="h-4 w-4" /> {t("arbitrage.archivedStrategies" as any)}</h3>
          <Table>
            <TableHeader><TableRow><TableHead>{t("charging.name" as any)}</TableHead><TableHead>{t("arbitrage.storages" as any)}</TableHead><TableHead>{t("arbitrage.buyBelow" as any)}</TableHead><TableHead>{t("arbitrage.sellAbove" as any)}</TableHead><TableHead>{t("common.status" as any)}</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {archivedStrategies.map((s) => renderStrategyRow(s, true))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Trades Tab ──
function TradesTab() {
  const { t } = useTranslation();
  const { trades, totalRevenue } = useArbitrageTrades();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{t("arbitrage.tradeHistory" as any)}</h2>
        <Badge variant={totalRevenue >= 0 ? "default" : "destructive"}>{t("charging.total" as any)}: {totalRevenue.toFixed(2)} €</Badge>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>{t("arbitrage.timestamp" as any)}</TableHead><TableHead>{t("arbitrage.tradeType" as any)}</TableHead><TableHead>{t("arbitrage.storages" as any)}</TableHead><TableHead>{t("arbitrage.energy" as any)}</TableHead><TableHead>{t("arbitrage.price" as any)}</TableHead><TableHead>{t("arbitrage.revenue" as any)}</TableHead></TableRow></TableHeader>
        <TableBody>
          {trades.map((tr) => (
            <TableRow key={tr.id}>
              <TableCell>{format(new Date(tr.timestamp), "dd.MM.yyyy HH:mm")}</TableCell>
              <TableCell><Badge variant={tr.trade_type === "charge" ? "secondary" : "default"}>{tr.trade_type === "charge" ? t("arbitrage.charge" as any) : t("arbitrage.discharge" as any)}</Badge></TableCell>
              <TableCell>{(tr as any).energy_storages?.name || "–"}</TableCell>
              <TableCell>{Number(tr.energy_kwh).toFixed(1)} kWh</TableCell>
              <TableCell>{Number(tr.price_eur_mwh).toFixed(1)} €/MWh</TableCell>
              <TableCell className={Number(tr.revenue_eur) >= 0 ? "text-green-600" : "text-destructive"}>{Number(tr.revenue_eur).toFixed(2)} €</TableCell>
            </TableRow>
          ))}
          {trades.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("arbitrage.noTrades" as any)}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

export default ArbitrageTrading;
