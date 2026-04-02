import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Cpu,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings2,
  ToggleLeft,
  Gauge,
  Lightbulb,
  DoorOpen,
  Activity,
  Server,
  AlertTriangle,
  Play,
  Loader2,
  Pencil,
  Trash2,
  Clock,
  Thermometer,
  CalendarDays,
  GitBranch,
  Copy,
  ArrowRight,
  Zap,
  Power,
  Timer,
  AlarmClock,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { useLoxoneSensorsMulti, LoxoneSensor } from "@/hooks/useLoxoneSensors";
import { GATEWAY_DEFINITIONS } from "@/lib/gatewayRegistry";
import { useLocationAutomations, LocationAutomationRecord } from "@/hooks/useLocationAutomations";
import { useMeters } from "@/hooks/useMeters";
import { AutomationRuleBuilder, AutomationRuleData } from "@/components/locations/AutomationRuleBuilder";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

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

const ACTION_TYPES = [
  { value: "pulse", label: "arb.pulse" },
  { value: "On", label: "arb.turnOn" },
  { value: "Off", label: "arb.turnOff" },
  { value: "toggle", label: "arb.toggle" },
];

interface LocationAutomationProps {
  locationId: string;
}

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatPulseDuration(ms?: number): string {
  const val = ms ?? 500;
  if (val >= 1000 && val % 1000 === 0) return `${val / 1000} s`;
  return `${val} ms`;
}

function getActionLabel(actionType: string, pulseDuration?: number): string {
  switch (actionType) {
    case "pulse": return `Pulse (${formatPulseDuration(pulseDuration)})`;
    case "On": return "Einschalten";
    case "Off": return "Ausschalten";
    case "toggle": return "Umschalten";
    case "resetDay": return "Reset Tag";
    case "resetMonth": return "Reset Monat";
    case "resetYear": return "Reset Jahr";
    case "resetAll": return "Reset Alle";
    default: return actionType;
  }
}

/** Compact visual flow: Conditions → Action */
function AutomationFlowDiagram({ auto, actuatorStates }: {
  auto: LocationAutomationRecord;
  actuatorStates: Map<string, { value: string; status: string }>;
}) {
  const conditions = auto.conditions || [];
  const actions = auto.actions || [];
  const logicOp = auto.logic_operator || "AND";

  const conditionChips: { icon: React.ElementType; label: string }[] = [];
  conditions.forEach((c) => {
    switch (c.type) {
      case "sensor_value":
        conditionChips.push({
          icon: Thermometer,
          label: `${c.sensor_name || "Sensor"} ${c.operator || ">"} ${c.value ?? ""}${c.unit ? ` ${c.unit}` : ""}`,
        });
        break;
      case "time":
        conditionChips.push({ icon: Clock, label: `${c.time_from || "?"} – ${c.time_to || "?"}` });
        break;
      case "time_point":
        conditionChips.push({ icon: AlarmClock, label: `⏱ ${c.time_point || "?"}` });
        break;
      case "time_switch":
        conditionChips.push({ icon: Timer, label: `${(c.time_points || []).length}× Zeitpunkte` });
        break;
      case "weekday":
        conditionChips.push({
          icon: CalendarDays,
          label: (c.weekdays || []).map((d) => WEEKDAY_SHORT[d] || d).join(", "),
        });
        break;
      case "status":
        conditionChips.push({
          icon: ToggleLeft,
          label: `${c.actuator_name || "Aktor"} = ${c.expected_status || "?"}`,
        });
        break;
    }
  });

  const actionChips = actions.length > 0 ? actions : [{
    actuator_uuid: auto.actuator_uuid,
    actuator_name: auto.actuator_name,
    action_type: auto.action_type === "pulse" ? "pulse" : (auto.action_value || "On"),
    pulse_duration: undefined as number | undefined,
  }];

  return (
    <div className="flex items-start gap-1.5 mt-2 text-[11px] flex-wrap">
      {conditionChips.length > 0 && (
        <>
          <div className="flex flex-col gap-1">
            {conditionChips.map((chip, i) => {
              const I = chip.icon;
              return (
                <div key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className="text-[9px] font-mono text-muted-foreground mr-0.5">
                      {logicOp}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5">
                    <I className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate max-w-[140px]">{chip.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
        </>
      )}
      <div className="flex flex-col gap-1">
        {actionChips.map((action, i) => {
          const state = actuatorStates.get(action.actuator_uuid);
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5"
            >
              <Zap className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate max-w-[120px] font-medium">{action.actuator_name}</span>
              <Badge variant="outline" className="text-[9px] py-0 px-1 h-4">
                {getActionLabel(action.action_type, (action as any).pulse_duration)}
              </Badge>
              {state && (
                <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${
                  state.value === "1" || state.value?.toLowerCase() === "on"
                    ? "text-green-600"
                    : "text-muted-foreground"
                }`}>
                  <Power className="h-2.5 w-2.5" />
                  {state.value === "1" || state.value?.toLowerCase() === "on" ? "On" : "Off"}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export const LocationAutomation = ({ locationId }: LocationAutomationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const [configOpen, setConfigOpen] = useState(false);
  const [ruleBuilderOpen, setRuleBuilderOpen] = useState(false);
  const [editAutomation, setEditAutomation] = useState<LocationAutomationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocationAutomationRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { locationIntegrations, loading: intLoading } = useLocationIntegrations(locationId);
  const { meters } = useMeters(locationId);

  // Build sensor_uuid -> user-defined meter name map
  const sensorNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    meters.forEach((m) => {
      if (m.sensor_uuid && m.name) map[m.sensor_uuid] = m.name;
    });
    return map;
  }, [meters]);

  // Find all active gateway integrations (not just Loxone/HA)
  const gatewayIntegrations = useMemo(() =>
    locationIntegrations.filter(
      (li) => li.is_enabled && li.integration?.type && GATEWAY_DEFINITIONS[li.integration.type]
    ), [locationIntegrations]);

  const integrationIds = useMemo(() => gatewayIntegrations.map((li) => li.id), [gatewayIntegrations]);
  const integrationTypes = useMemo(() => gatewayIntegrations.map((li) => li.integration?.type), [gatewayIntegrations]);

  const sensorQueries = useLoxoneSensorsMulti(integrationIds, integrationTypes);
  const sensorsLoading = sensorQueries.some((q) => q.isLoading);

  // Build a map of integrationId -> integration label for grouping
  const integrationLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    gatewayIntegrations.forEach((li) => {
      const def = li.integration?.type ? GATEWAY_DEFINITIONS[li.integration.type] : undefined;
      map[li.id] = def?.label || li.integration?.type || "Unknown";
    });
    return map;
  }, [gatewayIntegrations]);

  // Set of sensor_uuids that have been explicitly integrated (assigned as meters)
  const integratedSensorUuids = useMemo(() => {
    const ids = new Set<string>();
    meters.forEach((m) => {
      if (m.sensor_uuid) ids.add(m.sensor_uuid);
    });
    return ids;
  }, [meters]);

  // Merge sensors from all integrations, override name with user-defined meter name
  // FILTER: only include devices that have been integrated (have a matching sensor_uuid in meters)
  const allSensorsWithSource = useMemo(() => {
    const result: (LoxoneSensor & { _integrationId: string; _integrationLabel: string })[] = [];
    sensorQueries.forEach((q, idx) => {
      const intId = integrationIds[idx];
      const label = integrationLabelMap[intId] || "Unknown";
      (q.data || []).forEach((s) => {
        if (!integratedSensorUuids.has(s.id)) return; // Skip non-integrated devices
        result.push({
          ...s,
          name: sensorNameMap[s.id] || s.name,
          _integrationId: intId,
          _integrationLabel: label,
        });
      });
    });
    return result;
  }, [sensorQueries, integrationIds, integrationLabelMap, sensorNameMap, integratedSensorUuids]);

  const hasAnyIntegration = gatewayIntegrations.length > 0;
  // For backward compat: pick the first gateway integration as default for new automations
  const defaultIntegration = gatewayIntegrations[0] || null;

  const {
    automations, lastErrors, loading: autoLoading, executing,
    createAutomation, updateAutomation, deleteAutomation, duplicateAutomation, executeAutomation,
  } = useLocationAutomations(locationId);

  const actuators = allSensorsWithSource.filter(isActuator);
  const allSensors = allSensorsWithSource as LoxoneSensor[];

  const filteredActuators = searchTerm
    ? actuators.filter((s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.room.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.controlType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : actuators;

  const groupByIntegrationAndRoom = (items: typeof allSensorsWithSource) => {
    const byIntegration: Record<string, Record<string, typeof allSensorsWithSource>> = {};
    items.forEach((s) => {
      const intLabel = s._integrationLabel || "Unknown";
      const room = s.room || "Unbekannt";
      if (!byIntegration[intLabel]) byIntegration[intLabel] = {};
      if (!byIntegration[intLabel][room]) byIntegration[intLabel][room] = [];
      byIntegration[intLabel][room].push(s);
    });
    return Object.entries(byIntegration).sort(([a], [b]) => a.localeCompare(b));
  };

  const openAddRule = () => {
    setEditAutomation(null);
    setRuleBuilderOpen(true);
  };

  const openEditRule = (auto: LocationAutomationRecord) => {
    setEditAutomation(auto);
    setRuleBuilderOpen(true);
  };

  const handleSaveRule = async (data: AutomationRuleData) => {
    if (!defaultIntegration) throw new Error(T("auto.noIntegration"));

    // Use first action as primary actuator for backward compatibility
    const primary = data.actions[0];

    if (editAutomation) {
      const { error } = await updateAutomation(editAutomation.id, {
        name: data.name,
        description: data.description || undefined,
        actuator_uuid: primary.actuator_uuid,
        actuator_name: primary.actuator_name,
        actuator_control_type: primary.control_type,
        action_type: primary.action_type === "pulse" ? "pulse" : "command",
        action_value: primary.action_value || primary.action_type,
        conditions: data.conditions,
        actions: data.actions,
        logic_operator: data.logic_operator,
        is_active: data.is_active,
      } as any);
      if (error) throw error;
      toast.success(T("auto.updated"));
    } else {
      const { error } = await createAutomation({
        location_id: locationId,
        location_integration_id: defaultIntegration.id,
        name: data.name,
        description: data.description || undefined,
        actuator_uuid: primary.actuator_uuid,
        actuator_name: primary.actuator_name,
        actuator_control_type: primary.control_type,
        action_type: primary.action_type === "pulse" ? "pulse" : "command",
        action_value: primary.action_value || primary.action_type,
        conditions: data.conditions,
        actions: data.actions,
        logic_operator: data.logic_operator,
        is_active: data.is_active,
      });
      if (error) throw error;
      toast.success(T("auto.created"));
    }
  };

  const handleExecute = async (auto: LocationAutomationRecord) => {
    const result = await executeAutomation(auto);
    if (result.success) {
      toast.success(T("auto.executed").replace("{name}", auto.name));
    } else {
      toast.error(result.error || T("auto.executeFailed"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteAutomation(deleteTarget.id);
    if (error) {
      toast.error(T("auto.deleteError"));
    } else {
      toast.success(T("auto.deleted"));
    }
    setDeleteTarget(null);
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-left group">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5" />
                      {T("common.automation")}
                      <HelpTooltip text={T("tooltip.automation")} />
                      {automations.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {automations.filter((a) => a.is_active).length} {T("auto.active")}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {T("auto.automationDesc")}
                    </CardDescription>
                  </div>
                </button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="space-y-3">
              {autoLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : automations.length > 0 ? (
                automations.map((auto) => {
                  const actionsCount = auto.actions?.length || 1;
                  const primaryName = auto.actions?.length > 0
                    ? auto.actions.map((a) => a.actuator_name).join(", ")
                    : auto.actuator_name;
                  const Icon = getSensorIcon(
                    auto.actuator_control_type === "Pushbutton" ? "button" :
                    auto.actuator_control_type === "Switch" ? "switch" :
                    auto.actuator_control_type === "Dimmer" ? "light" : "unknown"
                  );
                  const isExecuting = executing === auto.id;

                  return (
                    <div
                      key={auto.id}
                      className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                        auto.is_active
                          ? "bg-primary/5 border-primary/20"
                          : "bg-muted/30 border-border"
                      }`}
                    >
                      <div
                        className={`mt-0.5 rounded-lg p-2 ${
                          auto.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {auto.conditions?.length > 0 ? (
                          <GitBranch className="h-5 w-5" />
                        ) : (
                          <Icon className="h-5 w-5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{auto.name}</p>
                          {actionsCount > 1 && (
                            <Badge variant="secondary" className="text-[10px]">{actionsCount} {T("auto.actions")}</Badge>
                          )}
                        </div>
                        {auto.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{auto.description}</p>
                        )}
                        <ConditionSummary auto={auto} t={t} />
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Server className="h-3 w-3" />
                            {primaryName}
                          </span>
                          {auto.last_executed_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(auto.last_executed_at), { addSuffix: true, locale: de })}
                            </span>
                          )}
                          {lastErrors[auto.id]?.status === "error" && lastErrors[auto.id]?.trigger_type === "scheduled" && (
                            <span className="flex items-center gap-1 text-destructive" title={lastErrors[auto.id]?.error_message || ""}>
                              <AlertTriangle className="h-3 w-3" />
                              {T("auto.scheduledError")}
                            </span>
                          )}
                        </div>
                        {lastErrors[auto.id]?.status === "error" && lastErrors[auto.id]?.trigger_type === "scheduled" && lastErrors[auto.id]?.error_message && (
                          <p className="text-[11px] text-destructive/80 mt-1 truncate max-w-xs" title={lastErrors[auto.id]!.error_message!}>
                            {lastErrors[auto.id]!.error_message}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleExecute(auto)}
                          disabled={isExecuting || !auto.is_active}
                          title={T("auto.executeNow")}
                        >
                          {isExecuting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEditRule(auto)}
                          title={T("common.edit")}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={async () => {
                            const { error } = await duplicateAutomation(auto);
                            if (error) {
                              toast.error("Kopieren fehlgeschlagen");
                            } else {
                              toast.success(`„${auto.name} (Kopie)" erstellt`);
                            }
                          }}
                          title="Kopieren"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(auto)}
                          title={T("common.delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Switch
                          checked={auto.is_active}
                          onCheckedChange={(checked) =>
                            updateAutomation(auto.id, { is_active: checked })
                          }
                          className="ml-1"
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  {T("auto.noAutomations")}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setConfigOpen(true)}
                >
                  <Settings2 className="h-4 w-4" />
                  {T("auto.availableActuators")}
                  {!intLoading && hasAnyIntegration && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {actuators.length} {T("auto.actuators")}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={openAddRule}
                  disabled={!hasAnyIntegration}
                >
                  <Plus className="h-4 w-4" />
                  {T("auto.addAutomation")}
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── Verfügbare Aktoren Dialog ── */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              {T("auto.actuatorsTitle")}
            </DialogTitle>
            <DialogDescription>
              {T("auto.actuatorsDesc")}
            </DialogDescription>
          </DialogHeader>

          {!hasAnyIntegration ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {T("auto.noMiniserver")}<br />
                {T("auto.connectHint")}
              </p>
            </div>
          ) : sensorsLoading || intLoading ? (
            <div className="space-y-3 mt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <Input
                placeholder={T("auto.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9"
              />
              <Badge variant="secondary" className="gap-1">
                <ToggleLeft className="h-3 w-3" />
                {actuators.length} {T("auto.actuators")} ({T("auto.controllable")})
              </Badge>
              {filteredActuators.length > 0 ? (
                <div className="space-y-4">
                  {groupByIntegrationAndRoom(filteredActuators).map(([intLabel, rooms]) => (
                    <div key={intLabel} className="space-y-2">
                      {gatewayIntegrations.length > 1 && (
                        <Badge variant="default" className="text-xs">{intLabel}</Badge>
                      )}
                      {Object.entries(rooms).sort(([a], [b]) => a.localeCompare(b)).map(([room, items]) => (
                        <div key={room} className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground px-1">{room}</p>
                          {items.map((sensor) => {
                            const SIcon = getSensorIcon(sensor.type);
                            return (
                              <div
                                key={`${sensor._integrationId}-${sensor.id}`}
                                className="flex items-center gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20"
                              >
                                <div className="rounded-lg p-2 bg-primary/10 text-primary">
                                  <SIcon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm truncate">{sensor.name}</p>
                                    <Badge variant="outline" className="text-[10px] shrink-0">{sensor.controlType}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">{sensor.category}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-mono font-medium">
                                    {sensor.value}{sensor.unit ? ` ${sensor.unit}` : ""}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">{sensor.status}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                  {searchTerm ? T("auto.noResults") : T("auto.noActuators")}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Rule Builder Sheet ── */}
      <AutomationRuleBuilder
        open={ruleBuilderOpen}
        onOpenChange={(open) => {
          setRuleBuilderOpen(open);
          if (!open) setEditAutomation(null);
        }}
        sensors={allSensors}
        sensorsLoading={sensorsLoading}
        initialData={editAutomation ? {
          name: editAutomation.name,
          description: editAutomation.description || "",
          conditions: editAutomation.conditions,
          actions: editAutomation.actions,
          logic_operator: editAutomation.logic_operator,
          is_active: editAutomation.is_active,
          actuator_uuid: editAutomation.actuator_uuid,
          actuator_name: editAutomation.actuator_name,
          actuator_control_type: editAutomation.actuator_control_type,
          action_type: editAutomation.action_type,
          action_value: editAutomation.action_value,
        } : undefined}
        onSave={handleSaveRule}
        isEdit={!!editAutomation}
      />

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{T("auto.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {T("auto.deleteDesc").replace("{name}", deleteTarget?.name || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{T("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {T("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AiDisclaimer text="Automatisierungsregeln steuern Geräte und Systeme basierend auf Sensordaten. Keine Haftung für Fehlfunktionen oder unerwartetes Verhalten automatisierter Schaltvorgänge." />
    </>
  );
};
