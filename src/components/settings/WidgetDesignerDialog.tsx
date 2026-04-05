import { useState, useEffect } from "react";
import { useCustomWidgetDefinitions, CustomWidgetDefinition, CustomWidgetConfig, ChartType, AggregationType, ChartTypePerPeriod, TimePeriod, EnergyFlowNode, EnergyFlowConnection } from "@/hooks/useCustomWidgetDefinitions";
import { useMeters } from "@/hooks/useMeters";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WidgetPreview } from "./WidgetPreview";
import { EnergyFlowDesigner } from "./EnergyFlowDesigner";
import { BarChart3, LineChart, Gauge, Activity, Table2, Plus, X, GitBranch } from "lucide-react";

const CHART_TYPES: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  { value: "line", label: "Liniendiagramm", icon: <LineChart className="h-5 w-5" /> },
  { value: "bar", label: "Balkendiagramm", icon: <BarChart3 className="h-5 w-5" /> },
  { value: "gauge", label: "Gauge / Tacho", icon: <Gauge className="h-5 w-5" /> },
  { value: "kpi", label: "KPI-Kachel", icon: <Activity className="h-5 w-5" /> },
  { value: "table", label: "Tabelle", icon: <Table2 className="h-5 w-5" /> },
  { value: "energyflow", label: "Energieflussmonitor", icon: <GitBranch className="h-5 w-5" /> },
];

const TIME_PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "day", label: "Tag" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "quarter", label: "Quartal" },
  { value: "year", label: "Jahr" },
  { value: "all", label: "Gesamt" },
];

const AGGREGATIONS: { value: AggregationType; label: string }[] = [
  { value: "sum", label: "Summe" },
  { value: "avg", label: "Durchschnitt" },
  { value: "max", label: "Maximum" },
  { value: "min", label: "Minimum" },
];

const UNITS = ["kWh", "kW", "€", "m³", "MWh", "W", "%"];

const PRESET_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

const defaultConfig: CustomWidgetConfig = {
  meter_ids: [],
  aggregation: "sum",
  unit: "kWh",
  thresholds: [],
  y_range: { min: null, max: null },
  series_colors: {},
  chart_type_per_period: {},
};

interface WidgetDesignerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingWidget: CustomWidgetDefinition | null;
}

export function WidgetDesignerDialog({ open, onOpenChange, editingWidget }: WidgetDesignerDialogProps) {
  const { create, update, isCreating } = useCustomWidgetDefinitions();
  const { meters } = useMeters();

  const [name, setName] = useState("");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [color, setColor] = useState("#3b82f6");
  const [isShared, setIsShared] = useState(true);
  const [config, setConfig] = useState<CustomWidgetConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState("basics");
  const [previewPeriod, setPreviewPeriod] = useState<TimePeriod>("day");

  useEffect(() => {
    if (open) {
      if (editingWidget) {
        setName(editingWidget.name);
        setChartType(editingWidget.chart_type);
        setColor(editingWidget.color);
        setIsShared(editingWidget.is_shared);
        setConfig({ ...defaultConfig, ...editingWidget.config });
      } else {
        setName("");
        setChartType("line");
        setColor("#3b82f6");
        setIsShared(true);
        setConfig(defaultConfig);
      }
      setActiveTab("basics");
      setPreviewPeriod("day");
    }
  }, [open, editingWidget]);

  const handleSave = async () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      icon: "BarChart3",
      color,
      chart_type: chartType,
      config,
      is_shared: isShared,
    };

    if (editingWidget) {
      await update({ id: editingWidget.id, ...payload });
    } else {
      await create(payload);
    }
    onOpenChange(false);
  };

  const toggleMeter = (meterId: string) => {
    setConfig((prev) => {
      const ids = prev.meter_ids.includes(meterId)
        ? prev.meter_ids.filter((id) => id !== meterId)
        : [...prev.meter_ids, meterId];
      return { ...prev, meter_ids: ids };
    });
  };

  const setSeriesColor = (meterId: string, c: string) => {
    setConfig((prev) => ({
      ...prev,
      series_colors: { ...prev.series_colors, [meterId]: c },
    }));
  };

  const addThreshold = () => {
    setConfig((prev) => ({
      ...prev,
      thresholds: [...prev.thresholds, { value: 0, label: "Schwellenwert", color: "#ef4444" }],
    }));
  };

  const removeThreshold = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      thresholds: prev.thresholds.filter((_, i) => i !== index),
    }));
  };

  const updateThreshold = (index: number, field: string, value: string | number) => {
    setConfig((prev) => ({
      ...prev,
      thresholds: prev.thresholds.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  };

  const setPeriodChartType = (period: TimePeriod, ct: ChartType) => {
    setConfig((prev) => ({
      ...prev,
      chart_type_per_period: { ...prev.chart_type_per_period, [period]: ct },
    }));
  };

  const getPeriodChartType = (period: TimePeriod): ChartType => {
    return config.chart_type_per_period?.[period] ?? chartType;
  };

  // Reset a period override to use the default
  const resetPeriodChartType = (period: TimePeriod) => {
    setConfig((prev) => {
      const updated = { ...prev.chart_type_per_period };
      delete updated[period];
      return { ...prev, chart_type_per_period: updated };
    });
  };

  // Group meters by energy type
  const meterGroups = (meters || []).reduce<Record<string, typeof meters>>((acc, meter) => {
    const type = (meter as any).energy_type || "Sonstige";
    if (!acc[type]) acc[type] = [];
    acc[type]!.push(meter);
    return acc;
  }, {});

  const isEnergyFlow = chartType === "energyflow";
  const isValid = name.trim().length > 0 && (isEnergyFlow ? (config.energy_flow_nodes?.length ?? 0) > 0 : config.meter_ids.length > 0);

  // Resolve the chart type shown in preview based on selected preview period
  const previewChartType = getPeriodChartType(previewPeriod);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{editingWidget ? "Widget bearbeiten" : "Neues Widget erstellen"}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="basics" className="flex-1">Grundlagen</TabsTrigger>
            {!isEnergyFlow && <TabsTrigger value="data" className="flex-1">Datenquellen</TabsTrigger>}
            {isEnergyFlow && <TabsTrigger value="topology" className="flex-1">Topologie</TabsTrigger>}
            <TabsTrigger value="display" className="flex-1">Darstellung</TabsTrigger>
            <TabsTrigger value="preview" className="flex-1">Vorschau</TabsTrigger>
          </TabsList>

          {/* ── Basics ── */}
          <TabsContent value="basics" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Stromverbrauch Büro" />
            </div>

            <div className="space-y-2">
              <Label>Standard-Diagrammtyp</Label>
              <p className="text-xs text-muted-foreground">Wird verwendet, wenn keine zeitraumspezifische Einstellung gesetzt ist.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CHART_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setChartType(ct.value)}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-colors ${
                      chartType === ct.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {ct.icon}
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Farbe</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${
                      color === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <Input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-8 p-0 border-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={isShared} onCheckedChange={setIsShared} id="shared" />
              <Label htmlFor="shared">Für alle Nutzer sichtbar</Label>
            </div>
          </TabsContent>

          {/* ── Data sources ── */}
          <TabsContent value="data" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Zähler auswählen</Label>
              <div className="max-h-64 overflow-auto border rounded-lg p-2 space-y-3">
                {Object.entries(meterGroups).map(([type, groupMeters]) => (
                  <div key={type}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{type}</p>
                    <div className="space-y-1">
                      {(groupMeters || []).map((meter: any) => (
                        <label key={meter.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer">
                          <Checkbox
                            checked={config.meter_ids.includes(meter.id)}
                            onCheckedChange={() => toggleMeter(meter.id)}
                          />
                          <span className="text-sm truncate">{meter.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(meterGroups).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Keine Zähler verfügbar</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Aggregation</Label>
              <Select value={config.aggregation} onValueChange={(v) => setConfig((p) => ({ ...p, aggregation: v as AggregationType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGGREGATIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* ── Topology (energyflow only) ── */}
          <TabsContent value="topology" className="space-y-4 mt-4">
            <EnergyFlowDesigner
              nodes={config.energy_flow_nodes || []}
              connections={config.energy_flow_connections || []}
              meters={meters || []}
              onChange={(nodes, connections) =>
                setConfig((prev) => ({
                  ...prev,
                  energy_flow_nodes: nodes,
                  energy_flow_connections: connections,
                  // Sync meter_ids from nodes for data queries
                  meter_ids: nodes.map((n) => n.meter_id).filter(Boolean),
                }))
              }
            />
          </TabsContent>

          <TabsContent value="display" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Einheit</Label>
              <Select value={config.unit} onValueChange={(v) => setConfig((p) => ({ ...p, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Per-period chart type configuration */}
            <div className="space-y-2">
              <Label>Diagrammtyp pro Zeitraum</Label>
              <p className="text-xs text-muted-foreground">
                Lege fest, welcher Diagrammtyp bei welchem Dashboard-Zeitfilter angezeigt wird. Ohne Einstellung wird der Standard-Typ verwendet.
              </p>
              <div className="border rounded-lg divide-y">
                {TIME_PERIODS.map((tp) => {
                  const currentType = config.chart_type_per_period?.[tp.value];
                  const isOverridden = currentType !== undefined;
                  return (
                    <div key={tp.value} className="flex items-center gap-3 p-2.5">
                      <span className="text-sm font-medium w-16 shrink-0">{tp.label}</span>
                      <Select
                        value={isOverridden ? currentType : "__default__"}
                        onValueChange={(v) => {
                          if (v === "__default__") {
                            resetPeriodChartType(tp.value);
                          } else {
                            setPeriodChartType(tp.value, v as ChartType);
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1 h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">
                            Standard ({CHART_TYPES.find((ct) => ct.value === chartType)?.label})
                          </SelectItem>
                          {CHART_TYPES.map((ct) => (
                            <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>

            {config.meter_ids.length > 0 && (
              <div className="space-y-2">
                <Label>Farben pro Datenreihe</Label>
                <div className="space-y-2">
                  {config.meter_ids.map((mid, idx) => {
                    const meter = (meters || []).find((m: any) => m.id === mid) as any;
                    return (
                      <div key={mid} className="flex items-center gap-2">
                        <Input
                          type="color"
                          value={config.series_colors[mid] || PRESET_COLORS[idx % PRESET_COLORS.length]}
                          onChange={(e) => setSeriesColor(mid, e.target.value)}
                          className="h-8 w-8 p-0 border-0 cursor-pointer shrink-0"
                        />
                        <span className="text-sm truncate">{meter?.name || mid}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Schwellenwerte</Label>
                <Button type="button" variant="outline" size="sm" onClick={addThreshold} className="gap-1">
                  <Plus className="h-3 w-3" /> Hinzufügen
                </Button>
              </div>
              {config.thresholds.map((threshold, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input type="number" value={threshold.value} onChange={(e) => updateThreshold(idx, "value", Number(e.target.value))} className="w-24" placeholder="Wert" />
                  <Input value={threshold.label} onChange={(e) => updateThreshold(idx, "label", e.target.value)} className="flex-1" placeholder="Label" />
                  <Input type="color" value={threshold.color} onChange={(e) => updateThreshold(idx, "color", e.target.value)} className="h-8 w-8 p-0 border-0 cursor-pointer shrink-0" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeThreshold(idx)} className="h-8 w-8 shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Y-Achse Min</Label>
                <Input
                  type="number"
                  value={config.y_range.min ?? ""}
                  onChange={(e) => setConfig((p) => ({ ...p, y_range: { ...p.y_range, min: e.target.value ? Number(e.target.value) : null } }))}
                  placeholder="Auto"
                />
              </div>
              <div className="space-y-2">
                <Label>Y-Achse Max</Label>
                <Input
                  type="number"
                  value={config.y_range.max ?? ""}
                  onChange={(e) => setConfig((p) => ({ ...p, y_range: { ...p.y_range, max: e.target.value ? Number(e.target.value) : null } }))}
                  placeholder="Auto"
                />
              </div>
            </div>
          </TabsContent>

          {/* ── Preview ── */}
          <TabsContent value="preview" className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Label className="shrink-0">Vorschau-Zeitraum:</Label>
              <Select value={previewPeriod} onValueChange={(v) => setPreviewPeriod(v as TimePeriod)}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_PERIODS.map((tp) => (
                    <SelectItem key={tp.value} value={tp.value}>{tp.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-2">
                Typ: {CHART_TYPES.find((ct) => ct.value === previewChartType)?.label}
              </span>
            </div>
            <WidgetPreview
              name={name}
              chartType={previewChartType}
              color={color}
              config={config}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={!isValid || isCreating}>
            {editingWidget ? "Speichern" : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
