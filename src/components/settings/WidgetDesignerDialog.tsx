import { useState, useEffect } from "react";
import { useCustomWidgetDefinitions, CustomWidgetDefinition, CustomWidgetConfig, ChartType, AggregationType } from "@/hooks/useCustomWidgetDefinitions";
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
import { BarChart3, LineChart, Gauge, Activity, Table2, Plus, X } from "lucide-react";

const CHART_TYPES: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  { value: "line", label: "Liniendiagramm", icon: <LineChart className="h-5 w-5" /> },
  { value: "bar", label: "Balkendiagramm", icon: <BarChart3 className="h-5 w-5" /> },
  { value: "gauge", label: "Gauge / Tacho", icon: <Gauge className="h-5 w-5" /> },
  { value: "kpi", label: "KPI-Kachel", icon: <Activity className="h-5 w-5" /> },
  { value: "table", label: "Tabelle", icon: <Table2 className="h-5 w-5" /> },
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

  useEffect(() => {
    if (open) {
      if (editingWidget) {
        setName(editingWidget.name);
        setChartType(editingWidget.chart_type);
        setColor(editingWidget.color);
        setIsShared(editingWidget.is_shared);
        setConfig(editingWidget.config || defaultConfig);
      } else {
        setName("");
        setChartType("line");
        setColor("#3b82f6");
        setIsShared(true);
        setConfig(defaultConfig);
      }
      setActiveTab("basics");
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

  // Group meters by energy type
  const meterGroups = (meters || []).reduce<Record<string, typeof meters>>((acc, meter) => {
    const type = (meter as any).energy_type || "Sonstige";
    if (!acc[type]) acc[type] = [];
    acc[type]!.push(meter);
    return acc;
  }, {});

  const isValid = name.trim().length > 0 && config.meter_ids.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{editingWidget ? "Widget bearbeiten" : "Neues Widget erstellen"}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="basics" className="flex-1">Grundlagen</TabsTrigger>
            <TabsTrigger value="data" className="flex-1">Datenquellen</TabsTrigger>
            <TabsTrigger value="display" className="flex-1">Darstellung</TabsTrigger>
            <TabsTrigger value="preview" className="flex-1">Vorschau</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Stromverbrauch Büro" />
            </div>

            <div className="space-y-2">
              <Label>Diagrammtyp</Label>
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

          <TabsContent value="data" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Zähler auswählen</Label>
              <div className="max-h-64 overflow-auto border rounded-lg p-2 space-y-3">
                {Object.entries(meterGroups).map(([type, groupMeters]) => (
                  <div key={type}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{type}</p>
                    <div className="space-y-1">
                      {(groupMeters || []).map((meter: any) => (
                        <label
                          key={meter.id}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                        >
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGGREGATIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="display" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Einheit</Label>
              <Select value={config.unit} onValueChange={(v) => setConfig((p) => ({ ...p, unit: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {config.meter_ids.length > 0 && (chartType === "line" || chartType === "bar") && (
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
                  <Input
                    type="number"
                    value={threshold.value}
                    onChange={(e) => updateThreshold(idx, "value", Number(e.target.value))}
                    className="w-24"
                    placeholder="Wert"
                  />
                  <Input
                    value={threshold.label}
                    onChange={(e) => updateThreshold(idx, "label", e.target.value)}
                    className="flex-1"
                    placeholder="Label"
                  />
                  <Input
                    type="color"
                    value={threshold.color}
                    onChange={(e) => updateThreshold(idx, "color", e.target.value)}
                    className="h-8 w-8 p-0 border-0 cursor-pointer shrink-0"
                  />
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

          <TabsContent value="preview" className="mt-4">
            <WidgetPreview
              name={name}
              chartType={chartType}
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
