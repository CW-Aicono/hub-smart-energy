import { useMemo, useState } from "react";
import { useAnalyticsData, AnalyticsPeriod } from "@/hooks/useAnalyticsData";
import { useAutomationEventAnnotations } from "@/hooks/useAutomationEventAnnotations";
import { AnalysisBlock } from "@/hooks/useAnalysisWorkspaces";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Settings2, MapPin, Trash2, Plus, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TimeSeriesBlockProps {
  block: AnalysisBlock;
  period: AnalyticsPeriod;
  offset: number;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const ANNOTATION_COLORS = [
  { name: "Rot", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Gelb", value: "#eab308" },
  { name: "Grün", value: "#10b981" },
  { name: "Blau", value: "#3b82f6" },
  { name: "Violett", value: "#8b5cf6" },
];

interface Annotation {
  id: string;
  t: number;
  label: string;
  color: string;
}

export function TimeSeriesBlock({ block, period, offset, onConfigChange }: TimeSeriesBlockProps) {
  const meterIds = (block.config.meterIds as string[]) ?? [];
  const annotations = (block.config.annotations as Annotation[]) ?? [];
  const showAutomationEvents = (block.config.showAutomationEvents as boolean) ?? false;
  const { data: series, isLoading } = useAnalyticsData(meterIds, period, undefined, meterIds.length > 0, offset);
  const [configOpen, setConfigOpen] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ t: number } | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState(ANNOTATION_COLORS[0].value);

  const chartData = useMemo(() => {
    if (!series || series.length === 0) return [];
    const timeMap: Record<number, Record<string, number | string>> = {};
    series.forEach((s, idx) => {
      const key = `s${idx}`;
      s.data.forEach((p) => {
        if (!timeMap[p.t]) timeMap[p.t] = { t: p.t, label: p.label };
        timeMap[p.t][key] = p.v;
      });
    });
    return Object.values(timeMap).sort((a: any, b: any) => a.t - b.t);
  }, [series]);

  const updateAnnotations = (next: Annotation[]) => {
    onConfigChange(block.id, { ...block.config, annotations: next });
  };

  const handleChartClick = (state: any) => {
    if (!annotationMode || !state?.activePayload?.[0]?.payload) return;
    const t = state.activePayload[0].payload.t as number;
    setPendingAnnotation({ t });
    setDraftLabel("");
    setDraftColor(ANNOTATION_COLORS[0].value);
  };

  const savePendingAnnotation = () => {
    if (!pendingAnnotation || !draftLabel.trim()) return;
    const next: Annotation[] = [
      ...annotations,
      { id: crypto.randomUUID(), t: pendingAnnotation.t, label: draftLabel.trim(), color: draftColor },
    ];
    updateAnnotations(next);
    setPendingAnnotation(null);
    setAnnotationMode(false);
  };

  const deleteAnnotation = (id: string) => {
    updateAnnotations(annotations.filter((a) => a.id !== id));
  };

  if (meterIds.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-sm text-muted-foreground">
        Ziehe Geräte hierher
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Lade Daten...</div>;
  }

  if (!series || series.length === 0 || chartData.length === 0) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Keine Daten im Zeitraum</div>;
  }

  // Only show annotations that fall within current chart range
  const minT = (chartData[0] as any).t as number;
  const maxT = (chartData[chartData.length - 1] as any).t as number;
  const { data: eventAnnotations = [] } = useAutomationEventAnnotations({
    fromMs: showAutomationEvents ? minT : null,
    toMs: showAutomationEvents ? maxT : null,
    enabled: showAutomationEvents,
  });
  const visibleAnnotations = [
    ...annotations.filter((a) => a.t >= minT && a.t <= maxT),
    ...(showAutomationEvents ? eventAnnotations.filter((a) => a.t >= minT && a.t <= maxT) : []),
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] text-muted-foreground truncate">
          {series.map((s) => `${s.label} (${s.unit})`).join(" · ")}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant={annotationMode ? "default" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={() => setAnnotationMode((v) => !v)}
            title={annotationMode ? "Annotation abbrechen" : "Annotation hinzufügen (Klick im Chart)"}
          >
            <MapPin className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setConfigOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {annotationMode && (
        <div className="mb-1 text-[10px] text-primary font-medium">
          Klicke im Chart auf den Zeitpunkt für die Markierung
        </div>
      )}
      <div className={cn("flex-1 min-h-0", annotationMode && "cursor-crosshair")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} onClick={handleChartClick}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={40} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value: number, name: string) => {
                const idx = Number(name.replace("s", ""));
                const s = series[idx];
                return [value.toLocaleString("de-DE", { maximumFractionDigits: 2 }), s?.label ?? name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s, idx) => (
              <Line
                key={s.meterId}
                type="monotone"
                dataKey={`s${idx}`}
                name={s.label}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            {visibleAnnotations.map((a) => {
              // Find nearest chart point label for the ReferenceLine x value
              const nearest = (chartData as any[]).reduce((prev, cur) =>
                Math.abs(cur.t - a.t) < Math.abs(prev.t - a.t) ? cur : prev
              );
              return (
                <ReferenceLine
                  key={a.id}
                  x={nearest.label}
                  stroke={a.color}
                  strokeDasharray="4 2"
                  strokeWidth={1.5}
                  label={{
                    value: a.label,
                    position: "top",
                    fill: a.color,
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Pending annotation dialog */}
      <Dialog open={!!pendingAnnotation} onOpenChange={(o) => !o && setPendingAnnotation(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Annotation hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-xs text-muted-foreground">
              Zeitpunkt: {pendingAnnotation && new Date(pendingAnnotation.t).toLocaleString("de-DE")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="annot-label" className="text-xs">Beschriftung</Label>
              <Input
                id="annot-label"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="z. B. Wartung, Störung, Peak"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && savePendingAnnotation()}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Farbe</Label>
              <div className="flex gap-2">
                {ANNOTATION_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setDraftColor(c.value)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-transform",
                      draftColor === c.value ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAnnotation(null)}>Abbrechen</Button>
            <Button onClick={savePendingAnnotation} disabled={!draftLabel.trim()}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Block-Einstellungen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-xs text-muted-foreground">{meterIds.length} Gerät(e) zugeordnet</div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Annotationen ({annotations.length})</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setConfigOpen(false);
                    setAnnotationMode(true);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Neu
                </Button>
              </div>
              {annotations.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">Noch keine Annotationen</div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {annotations
                    .slice()
                    .sort((a, b) => a.t - b.t)
                    .map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-xs p-2 rounded border bg-card">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: a.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{a.label}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(a.t).toLocaleString("de-DE")}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => deleteAnnotation(a.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
