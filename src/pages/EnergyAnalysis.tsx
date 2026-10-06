import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine, LineChart,
} from "recharts";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Link2, Plus, X, Download, FileSpreadsheet, Info } from "lucide-react";
import { toast } from "sonner";
import { useMeters } from "@/hooks/useMeters";
import { useLocations } from "@/hooks/useLocations";
import {
  AnalysisState, decodeAnalysisState, encodeAnalysisState, resolveRange, resolveCompareRange, autoResolution,
  PRESETS, Preset, Resolution,
} from "@/lib/energyAnalysisState";
import { useEnergyAnalysisData, EASeries, ConcreteResolution, fetchHeatingDegreeDays, bucketStart } from "@/hooks/useEnergyAnalysisData";
import { downloadCSV, downloadXlsxMulti } from "@/lib/exportUtils";
import { exportYearLoadProfile } from "@/lib/loadProfileExport";

const PALETTE = ["#1f9d6b", "#2b8fd6", "#f59e0b", "#3355aa", "#dc2626", "#8b5cf6", "#0d9488", "#db2777", "#65a30d", "#ea580c"];

const PRESET_LABEL: Record<Preset, string> = {
  today: "Heute", yesterday: "Gestern", "7d": "Letzte 7 Tage", "30d": "Letzte 30 Tage", month: "Dieser Monat",
  lastMonth: "Letzter Monat", year: "Dieses Jahr", lastYear: "Letztes Jahr", custom: "Frei wählen",
};
const RES_LABEL: Record<Resolution, string> = { auto: "Automatisch", "5min": "5 Minuten", hour: "Stunde", day: "Tag", week: "Woche", month: "Monat" };

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: d });
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function fmtTime(t: number, res: ConcreteResolution) {
  const d = new Date(t);
  if (res === "5min" || res === "hour") return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (res === "month") return d.toLocaleDateString("de-DE", { month: "short", year: "numeric" });
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

function stats(s: EASeries) {
  const vals = s.points.map((p) => p.v).filter(Number.isFinite);
  const sorted = [...vals].sort((a, b) => a - b);
  const sum = vals.reduce((a, b) => a + b, 0);
  return {
    sum, avg: vals.length ? sum / vals.length : NaN,
    min: sorted[0], max: sorted[sorted.length - 1], base: quantile(sorted, 0.1),
  };
}

export default function EnergyAnalysis() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<AnalysisState>(() => decodeAnalysisState(params.get("a")));
  const { meters } = useMeters();
  const { locations } = useLocations();
  const [search, setSearch] = useState("");

  // Zustand → URL (ersetzen, kein History-Spam)
  useEffect(() => {
    const enc = encodeAnalysisState(state);
    if (params.get("a") !== enc) setParams({ a: enc }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const update = (patch: Partial<AnalysisState>) => setState((s) => ({ ...s, ...patch }));

  const range = useMemo(() => resolveRange(state), [state.preset, state.from, state.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmpRange = useMemo(() => resolveCompareRange(state, range), [state.cmp, state.cmpFrom, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const res: ConcreteResolution = state.view === "heatmap" ? "hour" : state.res === "auto" ? autoResolution(range) : state.res;
  const meterIds = state.series.map((s) => s.id);
  const [lpProgress, setLpProgress] = useState<number | null>(null);

  const { data, isLoading, isFetching } = useEnergyAnalysisData(meterIds, range, res, state.quantity);
  const { data: cmpData } = useEnergyAnalysisData(meterIds, state.view === "chart" ? cmpRange : null, res, state.quantity);

  // Bezug (Fläche / Heizgradtage)
  const locById = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l])), [locations]);
  const [hdd, setHdd] = useState<Map<string, Map<string, number>>>(new Map());
  const hddAllowed = res === "day" || res === "week" || res === "month";
  useEffect(() => {
    if (state.norm !== "hdd" || !hddAllowed || !data) return;
    const locIds = Array.from(new Set(data.series.map((s) => s.locationId).filter(Boolean))) as string[];
    let cancelled = false;
    Promise.all(locIds.map(async (id) => {
      const l = locById.get(id);
      if (!l?.latitude || !l?.longitude) return [id, new Map<string, number>()] as const;
      try { return [id, await fetchHeatingDegreeDays(l.latitude, l.longitude, range.from, range.to)] as const; }
      catch { return [id, new Map<string, number>()] as const; }
    })).then((entries) => { if (!cancelled) setHdd(new Map(entries)); });
    return () => { cancelled = true; };
  }, [state.norm, hddAllowed, data, range, locById]);

  const normalize = (s: EASeries): EASeries => {
    if (state.norm === "area") {
      const area = s.locationId ? Number(locById.get(s.locationId)?.net_floor_area ?? 0) : 0;
      if (!area) return { ...s, points: [], unit: `${s.unit}/m²` };
      return { ...s, unit: `${s.unit}/m²`, points: s.points.map((p) => ({ ...p, v: p.v / area })) };
    }
    if (state.norm === "hdd" && hddAllowed && s.kind === "meter") {
      const m = s.locationId ? hdd.get(s.locationId) : undefined;
      if (!m) return { ...s, points: [], unit: `${s.unit}/HGT` };
      const perBucket = new Map<number, number>();
      m.forEach((v, day) => {
        const k = bucketStart(new Date(`${day}T00:00:00`).getTime(), res);
        perBucket.set(k, (perBucket.get(k) ?? 0) + v);
      });
      return {
        ...s, unit: `${s.unit}/HGT`,
        points: s.points.filter((p) => (perBucket.get(p.t) ?? 0) > 0).map((p) => ({ ...p, v: p.v / perBucket.get(p.t)! })),
      };
    }
    return s;
  };

  const series = useMemo(() => (data?.series ?? []).map(normalize), [data, state.norm, hdd, locById, res]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmpSeries = useMemo(() => (cmpData?.series ?? []).map(normalize), [cmpData, state.norm, hdd, locById, res]); // eslint-disable-line react-hooks/exhaustive-deps
  const colorOf = (id: string, i: number) => state.series.find((x) => x.id === id)?.color ?? PALETTE[i % PALETTE.length];

  // Chart-Daten: Zeitachse der Hauptperiode, Vergleich per Positions-Versatz
  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    series.forEach((s) => s.points.forEach((p) => {
      const r = rows.get(p.t) ?? { t: p.t };
      r[s.meterId] = p.v; rows.set(p.t, r);
    }));
    if (cmpRange) {
      const shift = range.from.getTime() - cmpRange.from.getTime();
      cmpSeries.forEach((s) => s.points.forEach((p) => {
        const t = bucketStart(p.t + shift, res);
        const r = rows.get(t) ?? { t };
        r[`cmp_${s.meterId}`] = p.v; rows.set(t, r);
      }));
    }
    return Array.from(rows.values()).sort((a, b) => a.t - b.t);
  }, [series, cmpSeries, cmpRange, range, res]);

  const units = Array.from(new Set(series.map((s) => s.unit)));

  const filteredMeters = (meters ?? [])
    .filter((m: any) => !m.is_archived)
    .filter((m: any) => m.name.toLowerCase().includes(search.toLowerCase()));

  const toggleMeter = (id: string) => {
    if (meterIds.includes(id)) update({ series: state.series.filter((s) => s.id !== id) });
    else if (state.series.length < 20) update({ series: [...state.series, { id, color: PALETTE[state.series.length % PALETTE.length] }] });
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/analytics-studio/analyse?a=${encodeAnalysisState(state)}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link kopiert", { description: "Kollegen mit Zugriff sehen dieselbe Analyse." });
  };

  const exportRows = () => chartData.map((r) => {
    const row: Record<string, unknown> = { Zeit: new Date(r.t).toLocaleString("de-DE") };
    series.forEach((s) => {
      row[`${s.label} [${s.unit}]`] = r[s.meterId] ?? "";
      if (cmpRange) row[`${s.label} Vergleich [${s.unit}]`] = r[`cmp_${s.meterId}`] ?? "";
    });
    return row;
  });
  const kpiRows = () => series.map((s) => {
    const st = stats(s);
    return { Messstelle: s.label, Einheit: s.unit, Summe: s.kind === "meter" && state.quantity === "energy" ? st.sum : "", Mittel: st.avg, Min: st.min, Max: st.max, Grundlast: st.base };
  });
  const fileBase = `Energieanalyse_${isoDate(range.from)}_${isoDate(new Date(range.to.getTime() - 1))}`;

  // Heatmap-Serie
  const [heatId, setHeatId] = useState<string | null>(null);
  const heatSeries = series.find((s) => s.meterId === heatId) ?? series[0];

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto">
        <header className="border-b px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-card/30 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Zum Analytics Studio">
              <Link to="/analytics-studio"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <h1 className="text-base font-semibold">Energieanalyse</h1>
            {isFetching && <span className="text-xs text-muted-foreground">lädt…</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV(exportRows(), fileBase)} disabled={!chartData.length}>
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" disabled={!chartData.length}
              onClick={() => downloadXlsxMulti([{ name: "Werte", data: exportRows() }, { name: "Kennzahlen", data: kpiRows() }], fileBase)}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
            </Button>
            <Button variant="outline" size="sm" disabled={!meterIds.length || lpProgress !== null}
              title="Jahreslastgang (15-Minuten-Werte in W) der gewählten Messstellen als Excel"
              onClick={async () => {
                const y = Number(window.prompt("Jahreslastgang für welches Jahr?", String(new Date().getFullYear())));
                if (!y || y < 2000 || y > 2100) return;
                setLpProgress(0);
                try {
                  const n = await exportYearLoadProfile(
                    meterIds.map((id) => ({ id, name: meters.find((m) => m.id === id)?.name ?? id })), y, setLpProgress);
                  if (!n) window.alert("Für dieses Jahr liegen keine Leistungswerte vor.");
                } finally { setLpProgress(null); }
              }}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              {lpProgress !== null ? `Lastgang ${lpProgress.toLocaleString("de-DE")} %` : "Jahreslastgang 15 min"}
            </Button>
            <Button size="sm" onClick={copyLink}><Link2 className="h-4 w-4 mr-1.5" /> Link kopieren</Button>
          </div>
        </header>

        <div className="p-4 space-y-4">
          {/* Steuerleiste */}
          <Card>
            <CardContent className="pt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Zeitraum</Label>
                <Select value={state.preset} onValueChange={(v) => update({
                  preset: v as Preset,
                  ...(v === "custom" && !state.from ? { from: isoDate(range.from), to: isoDate(new Date(range.to.getTime() - 1)) } : {}),
                })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRESETS.map((p) => <SelectItem key={p} value={p}>{PRESET_LABEL[p]}</SelectItem>)}</SelectContent>
                </Select>
                {state.preset === "custom" && (
                  <div className="flex gap-2">
                    <Input type="date" value={state.from ?? ""} onChange={(e) => update({ from: e.target.value || undefined })} />
                    <Input type="date" value={state.to ?? ""} onChange={(e) => update({ to: e.target.value || undefined })} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Auflösung</Label>
                <Select value={state.res} onValueChange={(v) => update({ res: v as Resolution })} disabled={state.view === "heatmap"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(RES_LABEL) as Resolution[]).map((r) => (
                    <SelectItem key={r} value={r}>{RES_LABEL[r]}{r === "auto" ? ` (${RES_LABEL[autoResolution(range)]})` : ""}</SelectItem>
                  ))}</SelectContent>
                </Select>
                <div className="flex items-center gap-3 pt-1">
                  <Tabs value={state.quantity} onValueChange={(v) => update({ quantity: v as "energy" | "power" })}>
                    <TabsList className="h-8 inline-flex w-auto">
                      <TabsTrigger value="energy" className="text-xs">Energie</TabsTrigger>
                      <TabsTrigger value="power" className="text-xs">Leistung</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="flex items-center gap-1.5">
                    <Switch id="stacked" checked={state.stacked} onCheckedChange={(c) => update({ stacked: c })} />
                    <Label htmlFor="stacked" className="text-xs">Gestapelt</Label>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vergleich</Label>
                <Select value={state.cmp} onValueChange={(v) => update({ cmp: v as AnalysisState["cmp"], ...(v === "custom" && !state.cmpFrom ? { cmpFrom: isoDate(new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime()))) } : {}) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Vergleich</SelectItem>
                    <SelectItem value="prev">Vorperiode</SelectItem>
                    <SelectItem value="year">Vorjahr</SelectItem>
                    <SelectItem value="custom">Frei gewählter Start</SelectItem>
                  </SelectContent>
                </Select>
                {state.cmp === "custom" && (
                  <Input type="date" value={state.cmpFrom ?? ""} onChange={(e) => update({ cmpFrom: e.target.value || undefined })} />
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bezug</Label>
                <Select value={state.norm} onValueChange={(v) => update({ norm: v as AnalysisState["norm"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Absolutwerte</SelectItem>
                    <SelectItem value="area">Je m² Nettogrundfläche</SelectItem>
                    <SelectItem value="hdd">Je Heizgradtag (witterungsbereinigt)</SelectItem>
                  </SelectContent>
                </Select>
                {state.norm === "hdd" && !hddAllowed && (
                  <p className="text-xs text-muted-foreground">Nur bei Auflösung Tag, Woche oder Monat.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Messstellen */}
          <div className="flex flex-wrap items-center gap-2">
            {state.series.map((s, i) => {
              const m = (meters ?? []).find((x: any) => x.id === s.id);
              return (
                <div key={s.id} className="flex items-center gap-1.5 rounded-full border bg-card pl-1.5 pr-1 py-0.5 text-xs">
                  <input type="color" aria-label="Farbe" value={colorOf(s.id, i)} className="h-5 w-5 rounded-full border-0 bg-transparent p-0 cursor-pointer"
                    onChange={(e) => update({ series: state.series.map((x) => x.id === s.id ? { ...x, color: e.target.value } : x) })} />
                  <span className="max-w-[180px] truncate">{m?.name ?? "Nicht verfügbar"}</span>
                  <Select value={s.type ?? (state.quantity === "energy" ? "bar" : "line")} onValueChange={(v) => update({ series: state.series.map((x) => x.id === s.id ? { ...x, type: v as "line" | "bar" | "area" } : x) })}>
                    <SelectTrigger className="h-6 w-[80px] text-xs border-0 bg-transparent"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="line">Linie</SelectItem>
                      <SelectItem value="bar">Balken</SelectItem>
                      <SelectItem value="area">Fläche</SelectItem>
                    </SelectContent>
                  </Select>
                  <button className="p-0.5 rounded-full hover:bg-muted" onClick={() => toggleMeter(s.id)} aria-label="Entfernen"><X className="h-3 w-3" /></button>
                </div>
              );
            })}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-1" /> Messstelle</Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <Input placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
                <div className="max-h-72 overflow-y-auto space-y-0.5">
                  {filteredMeters.map((m: any) => (
                    <label key={m.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                      <Checkbox checked={meterIds.includes(m.id)} onCheckedChange={() => toggleMeter(m.id)} />
                      <span className="flex-1 truncate">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{locById.get(m.location_id)?.name ?? ""}</span>
                    </label>
                  ))}
                  {!filteredMeters.length && <p className="text-xs text-muted-foreground p-2">Keine Messstellen gefunden.</p>}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {!!data?.missing.length && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {data.missing.length} Messstelle(n) aus dem Link sind für Sie nicht sichtbar und wurden ausgeblendet.
              </AlertDescription>
            </Alert>
          )}

          <Tabs value={state.view} onValueChange={(v) => update({ view: v as AnalysisState["view"] })}>
            <TabsList>
              <TabsTrigger value="chart">Verlauf</TabsTrigger>
              <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
              <TabsTrigger value="duration">Dauerlinie</TabsTrigger>
            </TabsList>
          </Tabs>

          <Card>
            <CardContent className="pt-4">
              {!meterIds.length ? (
                <p className="text-sm text-muted-foreground py-16 text-center">Fügen Sie oben eine oder mehrere Messstellen hinzu.</p>
              ) : isLoading ? (
                <Skeleton className="h-[420px] w-full" />
              ) : state.view === "chart" ? (
                <div className="h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => fmtTime(t, res)} tick={{ fontSize: 10 }} />
                      {units.map((u, i) => (
                        <YAxis key={u} yAxisId={u} orientation={i % 2 ? "right" : "left"} tick={{ fontSize: 10 }} width={56}
                          tickFormatter={(v) => fmt(v, 1)} label={{ value: u, angle: -90, position: i % 2 ? "insideRight" : "insideLeft", fontSize: 10 }} />
                      ))}
                      <Tooltip labelFormatter={(t) => fmtTime(Number(t), res)} formatter={(v: number, name: string) => [fmt(v), name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {series.map((s, i) => {
                        const color = colorOf(s.meterId, i);
                        const type = state.series.find((x) => x.id === s.meterId)?.type ?? (state.quantity === "energy" ? "bar" : "line");
                        const common = { key: s.meterId, dataKey: s.meterId, name: `${s.label} [${s.unit}]`, yAxisId: s.unit, isAnimationActive: false } as const;
                        const stackId = state.stacked ? `stack_${s.unit}` : undefined;
                        if (type === "bar") return <Bar {...common} fill={color} stackId={stackId} />;
                        if (type === "area") return <Area {...common} type="monotone" stroke={color} fill={color} fillOpacity={0.25} stackId={stackId} />;
                        return <Line {...common} type="monotone" stroke={color} dot={false} strokeWidth={1.5} connectNulls />;
                      })}
                      {cmpRange && cmpSeries.map((s, i) => (
                        <Line key={`cmp_${s.meterId}`} dataKey={`cmp_${s.meterId}`} name={`${s.label} (Vergleich)`} yAxisId={s.unit}
                          type="monotone" stroke={colorOf(s.meterId, i)} strokeDasharray="5 4" strokeOpacity={0.7} dot={false} connectNulls isAnimationActive={false} />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : state.view === "heatmap" ? (
                <Heatmap series={heatSeries} allSeries={series} onSelect={setHeatId} />
              ) : (
                <DurationCurve series={series} colorOf={colorOf} />
              )}
            </CardContent>
          </Card>

          {/* Kennzahlen */}
          {series.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Kennzahlen</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left py-1.5">Messstelle</th><th className="text-right">Summe</th><th className="text-right">Mittel</th>
                      <th className="text-right">Min</th><th className="text-right">Max</th><th className="text-right">Grundlast</th>
                      {cmpRange && state.view === "chart" && <><th className="text-right">Vergleich</th><th className="text-right">Abweichung</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((s, i) => {
                      const st = stats(s);
                      const showSum = s.kind === "meter" && state.quantity === "energy";
                      const c = cmpSeries.find((x) => x.meterId === s.meterId);
                      const cst = c ? stats(c) : null;
                      const a = showSum ? st.sum : st.avg;
                      const b = cst ? (showSum ? cst.sum : cst.avg) : NaN;
                      const diff = a - b;
                      return (
                        <tr key={s.meterId} className="border-b last:border-0">
                          <td className="py-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full mr-2" style={{ background: colorOf(s.meterId, i) }} />{s.label}</td>
                          <td className="text-right">{showSum ? `${fmt(st.sum)} ${s.unit}` : "–"}</td>
                          <td className="text-right">{fmt(st.avg)}</td>
                          <td className="text-right">{fmt(st.min)}</td>
                          <td className="text-right">{fmt(st.max)}</td>
                          <td className="text-right">{fmt(st.base)}</td>
                          {cmpRange && state.view === "chart" && <>
                            <td className="text-right">{fmt(b)}</td>
                            <td className={`text-right ${Number.isFinite(diff) ? (diff > 0 ? "text-destructive" : "text-primary") : ""}`}>
                              {Number.isFinite(diff) ? `${diff > 0 ? "+" : ""}${fmt(diff)} ${s.unit} (${b ? fmt((diff / b) * 100, 1) : "–"} %)` : "–"}
                            </td>
                          </>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-muted-foreground mt-2">Grundlast = 10-%-Quantil der Intervallwerte. Summe nur bei Zählern in Energie-Ansicht.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function Heatmap({ series, allSeries, onSelect }: { series?: EASeries; allSeries: EASeries[]; onSelect: (id: string) => void }) {
  if (!series) return null;
  const days = new Map<string, (number | undefined)[]>();
  series.points.forEach((p) => {
    const d = new Date(p.t);
    const key = isoDate(d);
    const row = days.get(key) ?? new Array(24).fill(undefined);
    row[d.getHours()] = (row[d.getHours()] ?? 0) + p.v;
    days.set(key, row);
  });
  const vals = series.points.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const rows = Array.from(days.entries()).sort();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs">Messstelle</Label>
        <Select value={series.meterId} onValueChange={onSelect}>
          <SelectTrigger className="h-8 w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>{allSeries.map((s) => <SelectItem key={s.meterId} value={s.meterId}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Stunde × Tag, {series.unit} · min {fmt(min)} · max {fmt(max)}</span>
      </div>
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <div className="grid gap-px text-[9px]" style={{ gridTemplateColumns: "72px repeat(24, minmax(14px, 1fr))" }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center text-muted-foreground">{h}</div>)}
          {rows.map(([day, hours]) => (
            <div key={day} className="contents">
              <div className="text-muted-foreground pr-1 text-right">{new Date(`${day}T00:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
              {hours.map((v, h) => (
                <div key={h} className="h-4 rounded-[2px] bg-primary" title={`${day} ${h}:00 – ${fmt(v)} ${series.unit}`}
                  style={{ opacity: v == null ? 0.05 : 0.12 + 0.88 * ((v - min) / (max - min || 1)) }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DurationCurve({ series, colorOf }: { series: EASeries[]; colorOf: (id: string, i: number) => string }) {
  const maxLen = Math.max(0, ...series.map((s) => s.points.length));
  const sortedBy = series.map((s) => [...s.points.map((p) => p.v)].sort((a, b) => b - a));
  const data = Array.from({ length: maxLen }, (_, i) => {
    const row: Record<string, number> = { pct: maxLen > 1 ? (i / (maxLen - 1)) * 100 : 0 };
    series.forEach((s, si) => {
      const arr = sortedBy[si];
      const idx = Math.round((i / Math.max(1, maxLen - 1)) * (arr.length - 1));
      if (arr.length) row[s.meterId] = arr[idx];
    });
    return row;
  });
  const first = sortedBy[0] ?? [];
  const peak = first[0];
  const base = quantile([...first].sort((a, b) => a - b), 0.1);
  return (
    <div className="h-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="pct" type="number" domain={[0, 100]} tickFormatter={(v) => `${fmt(v, 0)} %`} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v) => fmt(v, 1)} />
          <Tooltip labelFormatter={(v) => `${fmt(Number(v), 1)} % der Zeit`} formatter={(v: number, n: string) => [fmt(v), n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {Number.isFinite(peak) && <ReferenceLine y={peak} strokeDasharray="4 4" className="stroke-destructive" label={{ value: `Spitze ${fmt(peak)}`, fontSize: 10, position: "insideTopRight" }} />}
          {Number.isFinite(base) && <ReferenceLine y={base} strokeDasharray="4 4" className="stroke-primary" label={{ value: `Grundlast ${fmt(base)}`, fontSize: 10, position: "insideBottomRight" }} />}
          {series.map((s, i) => (
            <Line key={s.meterId} dataKey={s.meterId} name={`${s.label} [${s.unit}]`} stroke={colorOf(s.meterId, i)} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
