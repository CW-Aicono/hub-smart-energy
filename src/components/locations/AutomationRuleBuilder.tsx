import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Thermometer,
  Clock,
  CalendarDays,
  ToggleLeft,
  Lightbulb,
  DoorOpen,
  Gauge,
  Activity,
  Server,
  Zap,
  GitBranch,
  ArrowRight,
} from "lucide-react";
import { LoxoneSensor } from "@/hooks/useLoxoneSensors";
import { toast } from "sonner";

// ── Types ──

export interface AutomationCondition {
  id: string;
  type: "sensor_value" | "time" | "weekday" | "status";
  connector?: "AND" | "OR"; // how this condition connects to the previous one
  sensor_uuid?: string;
  sensor_name?: string;
  operator?: ">" | "<" | "=" | ">=" | "<=";
  value?: number;
  unit?: string;
  time_from?: string;
  time_to?: string;
  weekdays?: number[];
  actuator_uuid?: string;
  actuator_name?: string;
  expected_status?: string;
}

export interface AutomationAction {
  id: string;
  actuator_uuid: string;
  actuator_name: string;
  control_type: string;
  action_type: string;
  action_value?: string;
}

export interface AutomationRuleData {
  name: string;
  description: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  logic_operator: "AND" | "OR";
  is_active: boolean;
}

interface AutomationRuleBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensors: LoxoneSensor[];
  sensorsLoading: boolean;
  initialData?: Partial<AutomationRuleData> & { actuator_uuid?: string; actuator_name?: string; actuator_control_type?: string; action_type?: string; action_value?: string | null };
  onSave: (data: AutomationRuleData) => Promise<void>;
  isEdit?: boolean;
}

// ── Helpers ──

const uid = () => crypto.randomUUID();

const WEEKDAYS = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 0, label: "So" },
];

const OPERATORS = [
  { value: ">", label: "größer als (>)" },
  { value: "<", label: "kleiner als (<)" },
  { value: ">=", label: "größer gleich (≥)" },
  { value: "<=", label: "kleiner gleich (≤)" },
  { value: "=", label: "gleich (=)" },
];

const ACTION_TYPES = [
  { value: "pulse", label: "Pulse (Taster)" },
  { value: "On", label: "Einschalten" },
  { value: "Off", label: "Ausschalten" },
  { value: "toggle", label: "Umschalten (Toggle)" },
];

const CONDITION_TYPES = [
  { value: "sensor_value", label: "Sensorwert", icon: Thermometer, desc: "Wenn ein Messwert einen Schwellenwert über-/unterschreitet" },
  { value: "time", label: "Uhrzeit", icon: Clock, desc: "Innerhalb eines Zeitfensters aktiv" },
  { value: "weekday", label: "Wochentage", icon: CalendarDays, desc: "Nur an bestimmten Wochentagen aktiv" },
  { value: "status", label: "Aktor-Status", icon: ToggleLeft, desc: "Wenn ein anderer Aktor einen bestimmten Zustand hat" },
];

function getSensorIcon(type: string) {
  switch (type) {
    case "temperature": return Thermometer;
    case "switch":
    case "digital":
    case "button": return ToggleLeft;
    case "light": return Lightbulb;
    case "blind": return DoorOpen;
    case "power": return Gauge;
    case "motion": return Activity;
    default: return Server;
  }
}

function isActuator(sensor: LoxoneSensor): boolean {
  const actuatorTypes = ["switch", "light", "blind", "button", "digital"];
  const actuatorControlTypes = [
    "Switch", "Dimmer", "Jalousie", "LightController", "LightControllerV2",
    "Pushbutton", "IRoomController", "IRoomControllerV2", "Gate", "Ventilation",
    "Daytimer", "Alarm", "CentralAlarm", "Intercom", "AalSmartAlarm",
    "Sauna", "Pool", "Hourcounter",
  ];
  return actuatorTypes.includes(sensor.type) || actuatorControlTypes.includes(sensor.controlType);
}

// ── Sub-Components ──

function ConditionCard({
  condition,
  sensors,
  onUpdate,
  onRemove,
}: {
  condition: AutomationCondition;
  sensors: LoxoneSensor[];
  onUpdate: (c: AutomationCondition) => void;
  onRemove: () => void;
}) {
  const condType = CONDITION_TYPES.find((t) => t.value === condition.type);
  const CondIcon = condType?.icon || Zap;

  return (
    <Card className="border-border/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-md p-1.5 bg-accent text-accent-foreground">
              <CondIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">{condType?.label}</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {condition.type === "sensor_value" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Sensor</Label>
              <Select
                value={condition.sensor_uuid || ""}
                onValueChange={(val) => {
                  const s = sensors.find((s) => s.id === val);
                  onUpdate({ ...condition, sensor_uuid: val, sensor_name: s?.name || "", unit: s?.unit || "" });
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Sensor wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {sensors.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name} ({s.room}) {s.unit && `– ${s.unit}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Operator</Label>
                <Select
                  value={condition.operator || ">"}
                  onValueChange={(val) => onUpdate({ ...condition, operator: val as AutomationCondition["operator"] })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Wert {condition.unit && `(${condition.unit})`}</Label>
                <Input
                  type="number"
                  className="h-9 text-xs"
                  value={condition.value ?? ""}
                  onChange={(e) => onUpdate({ ...condition, value: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="z.B. 25"
                />
              </div>
            </div>
          </div>
        )}

        {condition.type === "time" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Von</Label>
              <Input
                type="time"
                className="h-9 text-xs"
                value={condition.time_from || ""}
                onChange={(e) => onUpdate({ ...condition, time_from: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bis</Label>
              <Input
                type="time"
                className="h-9 text-xs"
                value={condition.time_to || ""}
                onChange={(e) => onUpdate({ ...condition, time_to: e.target.value })}
              />
            </div>
          </div>
        )}

        {condition.type === "weekday" && (
          <div className="space-y-1">
            <Label className="text-xs">Aktive Tage</Label>
            <div className="flex gap-1 flex-wrap">
              {WEEKDAYS.map((wd) => {
                const active = condition.weekdays?.includes(wd.value);
                return (
                  <Button
                    key={wd.value}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8 w-10 text-xs px-0"
                    onClick={() => {
                      const current = condition.weekdays || [];
                      const next = active ? current.filter((d) => d !== wd.value) : [...current, wd.value];
                      onUpdate({ ...condition, weekdays: next });
                    }}
                  >
                    {wd.label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {condition.type === "status" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Aktor</Label>
              <Select
                value={condition.actuator_uuid || ""}
                onValueChange={(val) => {
                  const s = sensors.find((s) => s.id === val);
                  onUpdate({ ...condition, actuator_uuid: val, actuator_name: s?.name || "" });
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Aktor wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {sensors.filter(isActuator).map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      {s.name} ({s.room})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Erwarteter Status</Label>
              <Select
                value={condition.expected_status || "on"}
                onValueChange={(val) => onUpdate({ ...condition, expected_status: val })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on" className="text-xs">Eingeschaltet (On)</SelectItem>
                  <SelectItem value="off" className="text-xs">Ausgeschaltet (Off)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionCard({
  action,
  sensors,
  onUpdate,
  onRemove,
}: {
  action: AutomationAction;
  sensors: LoxoneSensor[];
  onUpdate: (a: AutomationAction) => void;
  onRemove: () => void;
}) {
  const actuators = sensors.filter(isActuator);
  const selected = actuators.find((s) => s.id === action.actuator_uuid);
  const SIcon = selected ? getSensorIcon(selected.type) : Server;

  return (
    <Card className="border-border/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-md p-1.5 bg-primary/10 text-primary">
              <SIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">{selected?.name || "Aktor wählen"}</span>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Aktor</Label>
            <Select
              value={action.actuator_uuid || ""}
              onValueChange={(val) => {
                const s = actuators.find((s) => s.id === val);
                if (s) onUpdate({ ...action, actuator_uuid: s.id, actuator_name: s.name, control_type: s.controlType });
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Wählen..." />
              </SelectTrigger>
              <SelectContent>
                {actuators.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name} ({s.room})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aktion</Label>
            <Select
              value={action.action_type || "pulse"}
              onValueChange={(val) => onUpdate({ ...action, action_type: val, action_value: val })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((at) => (
                  <SelectItem key={at.value} value={at.value} className="text-xs">{at.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──

export function AutomationRuleBuilder({
  open,
  onOpenChange,
  sensors,
  sensorsLoading,
  initialData,
  onSave,
  isEdit,
}: AutomationRuleBuilderProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [conditions, setConditions] = useState<AutomationCondition[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [logicOp, setLogicOp] = useState<"AND" | "OR">("AND");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addConditionOpen, setAddConditionOpen] = useState(false);

  // Init from initialData
  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setName(initialData.name || "");
      setDescription(initialData.description || "");
      setLogicOp(initialData.logic_operator || "AND");
      setIsActive(initialData.is_active !== undefined ? initialData.is_active : true);

      if (initialData.conditions && initialData.conditions.length > 0) {
        setConditions(initialData.conditions);
      } else {
        setConditions([]);
      }

      if (initialData.actions && initialData.actions.length > 0) {
        setActions(initialData.actions);
      } else if (initialData.actuator_uuid) {
        // Migrate from legacy single-actuator format
        setActions([{
          id: uid(),
          actuator_uuid: initialData.actuator_uuid,
          actuator_name: initialData.actuator_name || "",
          control_type: initialData.actuator_control_type || "",
          action_type: initialData.action_value || initialData.action_type || "pulse",
          action_value: initialData.action_value || undefined,
        }]);
      } else {
        setActions([]);
      }
    } else {
      setName("");
      setDescription("");
      setConditions([]);
      setActions([]);
      setLogicOp("AND");
      setIsActive(true);
    }
    setAddConditionOpen(false);
  }, [open, initialData]);

  const addCondition = (type: AutomationCondition["type"]) => {
    const base: AutomationCondition = { id: uid(), type, connector: "AND" };
    if (type === "sensor_value") { base.operator = ">"; }
    if (type === "weekday") { base.weekdays = [1, 2, 3, 4, 5]; }
    if (type === "time") { base.time_from = "08:00"; base.time_to = "18:00"; }
    if (type === "status") { base.expected_status = "on"; }
    setConditions((prev) => [...prev, base]);
    setAddConditionOpen(false);
  };

  const updateCondition = (id: string, updated: AutomationCondition) => {
    setConditions((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  const removeCondition = (id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const addAction = () => {
    setActions((prev) => [
      ...prev,
      { id: uid(), actuator_uuid: "", actuator_name: "", control_type: "", action_type: "pulse" },
    ]);
  };

  const updateAction = (id: string, updated: AutomationAction) => {
    setActions((prev) => prev.map((a) => (a.id === id ? updated : a)));
  };

  const removeAction = (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name ist erforderlich"); return; }
    if (actions.length === 0) { toast.error("Mindestens eine Aktion ist erforderlich"); return; }
    if (actions.some((a) => !a.actuator_uuid)) { toast.error("Alle Aktionen benötigen einen Aktor"); return; }

    setSaving(true);
    try {
      await onSave({ name, description, conditions, actions, logic_operator: logicOp, is_active: isActive });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <div className="flex flex-col h-full">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <GitBranch className="h-5 w-5" />
              {isEdit ? "Automation bearbeiten" : "Neue Automation"}
            </SheetTitle>
            <SheetDescription>
              Definieren Sie Bedingungen und Aktionen für die automatische Steuerung.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* ── Basic Info ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Allgemein</h3>
                <div className="flex items-center gap-2">
                  <Label htmlFor="rule-active" className="text-xs text-muted-foreground">Aktiv</Label>
                  <Switch id="rule-active" checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Name *</Label>
                <Input placeholder="z.B. Nachtabsenkung Büro" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Beschreibung</Label>
                <Textarea placeholder="Was macht diese Automation?" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
            </div>

            <Separator />

            {/* ── Conditions (WENN) ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono">WENN</Badge>
                  Bedingungen
                  {conditions.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{conditions.length}</Badge>
                  )}
                </h3>
              </div>

              {conditions.length === 0 && !addConditionOpen && (
                <div className="text-center py-4 border border-dashed rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">
                    Keine Bedingungen – die Automation kann jederzeit manuell ausgeführt werden.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setAddConditionOpen(true)} className="gap-1 text-xs">
                    <Plus className="h-3 w-3" />
                    Bedingung hinzufügen
                  </Button>
                </div>
              )}

              {conditions.map((cond, idx) => (
                <div key={cond.id}>
                  {idx > 0 && (
                    <div className="flex items-center justify-center py-1.5">
                      <div className="inline-flex items-center rounded-full border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateCondition(cond.id, { ...cond, connector: "AND" })}
                          className={`px-5 py-2 text-sm font-semibold rounded-l-full transition-colors ${
                            cond.connector !== "OR"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          UND
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCondition(cond.id, { ...cond, connector: "OR" })}
                          className={`px-5 py-2 text-sm font-semibold rounded-r-full transition-colors ${
                            cond.connector === "OR"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          ODER
                        </button>
                      </div>
                    </div>
                  )}
                  <ConditionCard
                    condition={cond}
                    sensors={sensors}
                    onUpdate={(c) => updateCondition(cond.id, c)}
                    onRemove={() => removeCondition(cond.id)}
                  />
                </div>
              ))}

              {/* Add condition picker */}
              {addConditionOpen ? (
                <Card className="border-dashed">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Bedingungstyp wählen:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {CONDITION_TYPES.map((ct) => {
                        const Icon = ct.icon;
                        return (
                          <button
                            key={ct.value}
                            type="button"
                            onClick={() => addCondition(ct.value as AutomationCondition["type"])}
                            className="flex items-start gap-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                          >
                            <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                            <div>
                              <p className="text-xs font-medium">{ct.label}</p>
                              <p className="text-[10px] text-muted-foreground leading-tight">{ct.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setAddConditionOpen(false)}>
                      Abbrechen
                    </Button>
                  </CardContent>
                </Card>
              ) : conditions.length > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setAddConditionOpen(true)} className="gap-1 text-xs w-full">
                  <Plus className="h-3 w-3" />
                  Weitere Bedingung
                </Button>
              ) : null}
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
            </div>

            {/* ── Actions (DANN) ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-mono bg-primary/5 text-primary border-primary/30">DANN</Badge>
                  Aktionen
                  {actions.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{actions.length}</Badge>
                  )}
                </h3>
              </div>

              {actions.length === 0 && (
                <div className="text-center py-4 border border-dashed rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">
                    Mindestens eine Aktion ist erforderlich.
                  </p>
                </div>
              )}

              {actions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  sensors={sensors}
                  onUpdate={(a) => updateAction(action.id, a)}
                  onRemove={() => removeAction(action.id)}
                />
              ))}

              <Button variant="outline" size="sm" onClick={addAction} className="gap-1 text-xs w-full">
                <Plus className="h-3 w-3" />
                Aktion hinzufügen
              </Button>
            </div>
          </div>

          {/* ── Footer ── */}
          <SheetFooter className="px-6 py-4 border-t bg-muted/30">
            <div className="flex items-center justify-between w-full gap-3">
              <div className="text-xs text-muted-foreground">
                {conditions.length > 0
                  ? `${conditions.length} Bedingung${conditions.length > 1 ? "en" : ""} · ${actions.length} Aktion${actions.length > 1 ? "en" : ""}`
                  : `Manuell · ${actions.length} Aktion${actions.length > 1 ? "en" : ""}`}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {isEdit ? "Speichern" : "Erstellen"}
                </Button>
              </div>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
