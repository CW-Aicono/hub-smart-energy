import { useMemo, useState } from "react";
import { useLocations } from "@/hooks/useLocations";
import {
  AnalyticsQuery,
  AnalyticsResult,
  useCopilotAnalyticsList,
  useDeleteAnalytics,
  useRunCopilotAnalytics,
  useTogglePinAnalytics,
} from "@/hooks/useCopilotAnalytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BarChart3, Loader2, Sparkles, Star, Trash2, History, Copy, RefreshCw, Search,
} from "lucide-react";
import { toast } from "sonner";

const SUGGESTED_PROMPTS: { label: string; prompt: string }[] = [
  { label: "Top-Stromverbraucher (Standorte)", prompt: "Welche 3 Standorte haben im ausgewählten Zeitraum den höchsten Stromverbrauch in kWh? Vergleiche sie in einem Balkendiagramm." },
  { label: "Grundlast-Entwicklung", prompt: "Wie hat sich die Grundlast (nächtlicher Minimalverbrauch) im ausgewählten Zeitraum entwickelt? Zeige den Verlauf pro Tag." },
  { label: "PV-Eigenverbrauchsquote", prompt: "Berechne die PV-Eigenverbrauchsquote pro Standort im ausgewählten Zeitraum und vergleiche sie." },
  { label: "Wallbox-Auslastung", prompt: "Wie war die Wallbox-Auslastung (kWh und Anzahl Sessions) pro Ladepunkt im ausgewählten Zeitraum?" },
  { label: "Spitzenlast-Tage", prompt: "Welche 5 Tage hatten die höchsten Lastspitzen im ausgewählten Zeitraum? Liste sie mit Datum und Spitzenwert in kW." },
  { label: "Verbrauchsanomalien", prompt: "Identifiziere Tage mit ungewöhnlich hohem oder niedrigem Stromverbrauch im ausgewählten Zeitraum." },
  { label: "PV-Ertrag pro Standort", prompt: "Wie hoch war der PV-Ertrag pro Standort im ausgewählten Zeitraum in kWh?" },
  { label: "Verbrauch pro Wochentag", prompt: "Wie verteilt sich der Stromverbrauch über die Wochentage (Mo–So) im ausgewählten Zeitraum?" },
];

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(152 55% 42%)",
  "hsl(199 89% 48%)",
  "hsl(43 96% 56%)",
  "hsl(0 84% 60%)",
  "hsl(262 83% 58%)",
];

function fmt(n: number, unit: string) {
  const opts = unit === "€" || unit === "EUR" ? { maximumFractionDigits: 2 } : { maximumFractionDigits: 1 };
  return `${n.toLocaleString("de-DE", opts)} ${unit}`.trim();
}

function ChartRenderer({ chart }: { chart: AnalyticsResult["chart"] }) {
  const flatData = useMemo(() => {
    if (!chart.series?.length) return [];
    // Merge series by x value
    const map = new Map<string, any>();
    for (const s of chart.series) {
      for (const p of s.data ?? []) {
        const row = map.get(p.x) ?? { x: p.x };
        row[s.name] = p.y;
        map.set(p.x, row);
      }
    }
    return Array.from(map.values());
  }, [chart]);

  const seriesNames = chart.series.map((s) => s.name);

  if (chart.type === "table") {
    return (
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">{chart.x_label}</th>
              {seriesNames.map((n) => (
                <th key={n} className="text-right p-2">{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flatData.map((row, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{row.x}</td>
                {seriesNames.map((n) => (
                  <td key={n} className="p-2 text-right">{typeof row[n] === "number" ? row[n].toLocaleString("de-DE", { maximumFractionDigits: 2 }) : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (chart.type === "pie") {
    const pieData = chart.series[0]?.data?.map((p) => ({ name: p.x, value: p.y })) ?? [];
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} label={(d) => `${d.name}: ${d.value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}`}>
            {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 })} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const ChartCmp = chart.type === "line" ? LineChart : BarChart;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ChartCmp data={flatData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="x" label={{ value: chart.x_label, position: "insideBottom", offset: -5 }} tick={{ fontSize: 11 }} />
        <YAxis label={{ value: chart.y_label, angle: -90, position: "insideLeft" }} tickFormatter={(v) => v.toLocaleString("de-DE")} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: any) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 })} />
        <Legend />
        {seriesNames.map((n, i) =>
          chart.type === "line"
            ? <Line key={n} type="monotone" dataKey={n} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
            : <Bar key={n} dataKey={n} fill={CHART_COLORS[i % CHART_COLORS.length]} />
        )}
      </ChartCmp>
    </ResponsiveContainer>
  );
}

function ResultCard({ query, onRerun }: { query: AnalyticsQuery; onRerun: () => void }) {
  const r = query.result_json;
  if (!r) return null;

  const copyMarkdown = () => {
    const md = `# ${r.title}\n\n${r.kpis.map((k) => `- **${k.label}:** ${fmt(k.value, k.unit)}`).join("\n")}\n\n${r.insight_markdown}\n\n_Quellen: ${r.sources.join(", ")}_`;
    navigator.clipboard.writeText(md);
    toast.success("In Zwischenablage kopiert");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-lg">{r.title}</CardTitle>
            <CardDescription className="line-clamp-2">{query.prompt}</CardDescription>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="outline" size="sm" onClick={copyMarkdown} title="Als Markdown kopieren">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onRerun} title="Mit gleichen Parametern erneut ausführen">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {r.kpis?.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {r.kpis.map((k, i) => (
              <div key={i} className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-xl font-bold mt-1">{fmt(k.value, k.unit)}</div>
              </div>
            ))}
          </div>
        )}
        {r.chart?.series?.length > 0 && <ChartRenderer chart={r.chart} />}
        {r.insight_markdown && (
          <div className="rounded-lg border bg-primary/5 p-3 text-sm whitespace-pre-wrap">{r.insight_markdown}</div>
        )}
        {r.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {r.sources.map((s, i) => <Badge key={i} variant="outline" className="text-xs">{s}</Badge>)}
          </div>
        )}
        <AiDisclaimer text="KI-generierte Analyse auf Basis Ihrer Messdaten. Bitte vor Entscheidungen plausibilisieren." />
      </CardContent>
    </Card>
  );
}

export function AnalyticsTab() {
  const { locations = [] } = useLocations();
  const { data: list = [], isLoading } = useCopilotAnalyticsList();
  const runAnalytics = useRunCopilotAnalytics();
  const togglePin = useTogglePinAnalytics();
  const del = useDeleteAnalytics();

  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [prompt, setPrompt] = useState("");
  const [locationId, setLocationId] = useState<string>("__all__");
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const activeQuery = useMemo(
    () => list.find((q) => q.id === activeId) ?? null,
    [list, activeId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((x) => x.title.toLowerCase().includes(q) || x.prompt.toLowerCase().includes(q));
  }, [list, search]);

  const handleRun = async (overridePrompt?: string) => {
    const p = (overridePrompt ?? prompt).trim();
    if (!p) {
      toast.error("Bitte eine Frage eingeben");
      return;
    }
    const res = await runAnalytics.mutateAsync({
      prompt: p,
      location_id: locationId === "__all__" ? null : locationId,
      period_start: periodStart,
      period_end: periodEnd,
    });
    setActiveId(res.id);
    if (overridePrompt) setPrompt(overridePrompt);
  };

  const handleRerun = () => {
    if (!activeQuery) return;
    void handleRun(activeQuery.prompt);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Linke Spalte: Frage stellen */}
      <div className="lg:col-span-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Frage stellen
            </CardTitle>
            <CardDescription>
              Stelle eine beliebige Frage zu deinen Energie-Daten. Die KI baut daraus eine strukturierte Analyse mit Chart und Insight.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Deine Frage</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="z.B. Welche Standorte hatten im letzten Monat die höchste Grundlast?"
                rows={4}
                maxLength={1000}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Standort (optional)</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Alle Standorte</SelectItem>
                  {locations.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Von</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bis</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={runAnalytics.isPending || !prompt.trim()}
              onClick={() => handleRun()}
            >
              {runAnalytics.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyse läuft...</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />Analyse starten</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Vorschläge</CardTitle>
            <CardDescription className="text-xs">Klicken übernimmt die Frage – Standort/Zeitraum prüfen und dann „Analyse starten"</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((s, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="text-xs h-auto py-1.5"
                disabled={runAnalytics.isPending}
                onClick={() => setPrompt(s.prompt)}
              >
                {s.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Rechte Spalte: Ergebnis + Verlauf */}
      <div className="lg:col-span-8">
        <Tabs defaultValue="result">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="result" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              <span>Ergebnis</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-4 w-4" />
              <span>Gespeicherte Analysen ({list.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="result" className="mt-4">
            {runAnalytics.isPending ? (
              <Card><CardContent className="py-16 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
                Die KI analysiert Ihre Daten…
              </CardContent></Card>
            ) : activeQuery ? (
              <ResultCard query={activeQuery} onRerun={handleRerun} />
            ) : (
              <Card><CardContent className="py-16 text-center text-muted-foreground">
                <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p>Stelle eine Frage oder wähle einen Vorschlag, um zu starten.</p>
                <p className="text-xs mt-1">Frühere Analysen findest du im Tab „Gespeicherte Analysen".</p>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Analysen suchen…" className="pl-8" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Noch keine gespeicherten Analysen.</p>
                ) : (
                  <ScrollArea className="h-[480px] pr-3">
                    <ul className="space-y-2">
                      {filtered.map((q) => (
                        <li key={q.id}>
                          <div className={`flex items-center gap-2 p-2 rounded-md border hover:bg-muted/40 ${activeId === q.id ? "border-primary bg-primary/5" : ""}`}>
                            <button
                              className="flex-1 text-left min-w-0"
                              onClick={() => setActiveId(q.id)}
                            >
                              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                {q.is_pinned && <Star className="h-3 w-3 fill-primary text-primary shrink-0" />}
                                {q.title}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {new Date(q.created_at).toLocaleString("de-DE")}
                                {q.period_start && q.period_end && ` · ${new Date(q.period_start).toLocaleDateString("de-DE")}–${new Date(q.period_end).toLocaleDateString("de-DE")}`}
                              </div>
                            </button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => togglePin.mutate({ id: q.id, is_pinned: !q.is_pinned })}
                              title={q.is_pinned ? "Pin entfernen" : "Anpinnen"}
                            >
                              <Star className={`h-4 w-4 ${q.is_pinned ? "fill-primary text-primary" : ""}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Analyse „${q.title}" löschen?`)) {
                                  del.mutate(q.id);
                                  if (activeId === q.id) setActiveId(null);
                                }
                              }}
                              title="Löschen"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
