import { useState, useMemo } from "react";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { useAlertRules, AlertRule } from "@/hooks/useAlertRules";
import { useUserRole } from "@/hooks/useUserRole";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { useLoxoneSensorsMulti, type LoxoneSensor } from "@/hooks/useLoxoneSensors";
import { GATEWAY_DEFINITIONS } from "@/lib/gatewayRegistry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Gauge, Plus, Pencil, Trash2, Archive, ArchiveRestore, Eye, EyeOff, Network,
  ChevronDown, ChevronRight, Thermometer, ToggleLeft, Lightbulb, DoorOpen,
  Activity, Server, Zap,
} from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useTranslation } from "@/hooks/useTranslation";
import { AddMeterDialog } from "./AddMeterDialog";
import { EditMeterDialog } from "./EditMeterDialog";
import { AddAlertRuleDialog } from "./AddAlertRuleDialog";
import { EditAlertRuleDialog } from "./EditAlertRuleDialog";
import { MeterTreeView } from "./MeterTreeView";
import { MeterAggregationWidget } from "./MeterAggregationWidget";
import { ENERGY_TYPE_LABELS, ENERGY_BADGE_CLASSES } from "@/lib/energyTypeColors";

interface MeterManagementProps {
  locationId: string;
}

const TIME_UNIT_KEYS: Record<string, string> = {
  hour: "mm.timeHour",
  day: "mm.timeDay",
  week: "mm.timeWeek",
  month: "mm.timeMonth",
};

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

function isSensorOnly(sensor: LoxoneSensor): boolean {
  return !isActuator(sensor);
}

function getSensorIcon(type: string) {
  const cls = "h-4 w-4";
  switch (type) {
    case "temperature": return <Thermometer className={cls} />;
    case "switch":
    case "digital":
    case "button": return <ToggleLeft className={cls} />;
    case "light": return <Lightbulb className={cls} />;
    case "blind": return <DoorOpen className={cls} />;
    case "power": return <Gauge className={cls} />;
    case "motion": return <Activity className={cls} />;
    default: return <Server className={cls} />;
  }
}

function getUnitIcon(unit: string) {
  const cls = "h-4 w-4";
  const u = (unit || "").toLowerCase();
  if (u === "°c" || u === "°f" || u === "k") return <Thermometer className={cls} />;
  if (u === "kwh" || u === "kw" || u === "w" || u === "wh") return <Zap className={cls} />;
  if (u === "v" || u === "a") return <Activity className={cls} />;
  return <Gauge className={cls} />;
}

function DeviceTable({ devices, type }: { devices: (LoxoneSensor & { _integrationLabel: string })[]; type: "sensor" | "actuator" }) {
  if (devices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {type === "sensor" ? "Keine Sensoren gefunden." : "Keine Aktoren gefunden."}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">Typ</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Raum</TableHead>
          <TableHead>Gateway</TableHead>
          <TableHead>Steuerungstyp</TableHead>
          <TableHead className="text-right">Wert</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((d) => (
          <TableRow key={`${d._integrationLabel}-${d.id}`}>
            <TableCell>
              <div className="p-1.5 rounded bg-muted w-fit">
                {d.unit ? getUnitIcon(d.unit) : getSensorIcon(d.type)}
              </div>
            </TableCell>
            <TableCell className="font-medium">{d.name}</TableCell>
            <TableCell className="text-muted-foreground">{d.room || "–"}</TableCell>
            <TableCell>
              <Badge variant="outline" className="text-[10px]">{d._integrationLabel}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">{d.controlType}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {d.value}{d.unit ? ` ${d.unit}` : ""}
            </TableCell>
            <TableCell>
              <Badge variant={d.status === "online" ? "default" : "secondary"} className="text-[10px]">
                {d.status === "online" ? "Online" : "Offline"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export const MeterManagement = ({ locationId }: MeterManagementProps) => {
  const { meters, loading: metersLoading, deleteMeter, updateMeter, archiveMeter, updateMeterParent } = useMeters(locationId);
  const { t } = useTranslation();
  const { alertRules, loading: rulesLoading, deleteAlertRule, toggleAlertRule, updateAlertRule } = useAlertRules(locationId);
  const { readings } = useMeterReadings();
  const { isAdmin } = useUserRole();
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Gateway integrations for sensor/actuator tabs
  const { locationIntegrations, loading: intLoading } = useLocationIntegrations(locationId);

  const gatewayIntegrations = useMemo(() =>
    locationIntegrations.filter(
      (li) => li.is_enabled && li.integration?.type && GATEWAY_DEFINITIONS[li.integration.type]
    ), [locationIntegrations]);

  const integrationIds = useMemo(() => gatewayIntegrations.map((li) => li.id), [gatewayIntegrations]);
  const integrationTypes = useMemo(() => gatewayIntegrations.map((li) => li.integration?.type), [gatewayIntegrations]);

  const sensorQueries = useLoxoneSensorsMulti(integrationIds, integrationTypes);
  const sensorsLoading = sensorQueries.some((q) => q.isLoading);

  const integrationLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    gatewayIntegrations.forEach((li) => {
      const def = li.integration?.type ? GATEWAY_DEFINITIONS[li.integration.type] : undefined;
      map[li.id] = def?.label || li.integration?.type || "Unknown";
    });
    return map;
  }, [gatewayIntegrations]);

  // Build sensor name map from meters for overrides
  const sensorNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    meters.forEach((m) => {
      if (m.sensor_uuid && m.name) map[m.sensor_uuid] = m.name;
    });
    return map;
  }, [meters]);

  const allDevicesWithSource = useMemo(() => {
    const result: (LoxoneSensor & { _integrationLabel: string })[] = [];
    sensorQueries.forEach((q, idx) => {
      const intId = integrationIds[idx];
      const label = integrationLabelMap[intId] || "Unknown";
      (q.data || []).forEach((s) => result.push({
        ...s,
        name: sensorNameMap[s.id] || s.name,
        _integrationLabel: label,
      }));
    });
    return result;
  }, [sensorQueries, integrationIds, integrationLabelMap, sensorNameMap]);

  const sensorDevices = useMemo(() => allDevicesWithSource.filter(isSensorOnly), [allDevicesWithSource]);
  const actuatorDevices = useMemo(() => allDevicesWithSource.filter(isActuator), [allDevicesWithSource]);

  const activeMeters = meters.filter((m) => !m.is_archived);
  const archivedMeters = meters.filter((m) => m.is_archived);
  const displayedMeters = showArchived ? archivedMeters : activeMeters;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
    <Card>
      <CardHeader>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 w-full text-left group">
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              {t("locSec.metersTitle" as any)}
              <HelpTooltip text={t("tooltip.meterManagement" as any)} />
            </CardTitle>
          </button>
        </CollapsibleTrigger>
        <CardDescription className="ml-6">
          {t("locSec.metersDesc" as any)}
        </CardDescription>
      </CardHeader>
      <CollapsibleContent>
      <CardContent>
        <Tabs defaultValue="meters">
          <TabsList>
            <TabsTrigger value="meters">{t("mm.tabs.meters" as any)} ({activeMeters.length})</TabsTrigger>
            <TabsTrigger value="sensors">Sensoren ({sensorDevices.length})</TabsTrigger>
            <TabsTrigger value="actuators">Aktoren ({actuatorDevices.length})</TabsTrigger>
            <TabsTrigger value="tree" className="gap-1">
              <Network className="h-3.5 w-3.5" />
              {t("mm.tabs.tree" as any)}
            </TabsTrigger>
            <TabsTrigger value="alerts">{t("mm.tabs.alerts" as any)} ({alertRules.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="meters" className="space-y-4">
            <div className="flex items-center justify-between">
              {(archivedMeters.length > 0 || showArchived) && (
                <Button variant={showArchived ? "outline" : "ghost"} size="sm" className="gap-1.5 text-xs" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {showArchived ? `${t("mm.showActive" as any)} (${activeMeters.length})` : `${t("mm.showArchive" as any)} (${archivedMeters.length})`}
                </Button>
              )}
              <div className="flex-1" />
              {isAdmin && !showArchived && (
                <Button size="sm" onClick={() => setMeterDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> {t("mm.addMeter" as any)}
                </Button>
              )}
            </div>
            {metersLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : displayedMeters.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {showArchived ? t("mm.noArchivedMeters" as any) : t("mm.noMeters" as any)}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>{t("common.name" as any)}</TableHead>
                     <TableHead>{t("mm.meterNumber" as any)}</TableHead>
                     <TableHead>{t("mm.captureType" as any)}</TableHead>
                     <TableHead>{t("mm.energyType" as any)}</TableHead>
                     <TableHead>{t("mm.unit" as any)}</TableHead>
                     {isAdmin && <TableHead className="w-32" />}
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedMeters.map((m) => (
                    <TableRow key={m.id} className={m.is_archived ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>{m.meter_number || "–"}</TableCell>
                      <TableCell>
                        <Badge variant={m.capture_type === "automatic" ? "default" : m.capture_type === "virtual" ? "outline" : "secondary"}>
                          {m.capture_type === "automatic" ? t("mm.captureAutomatic" as any) : m.capture_type === "virtual" ? t("mm.captureVirtual" as any) : t("mm.captureManual" as any)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ENERGY_BADGE_CLASSES[m.energy_type] || ""}>{ENERGY_TYPE_LABELS[m.energy_type] || m.energy_type}</Badge>
                      </TableCell>
                      <TableCell>{m.unit}</TableCell>
                      {isAdmin && (
                        <TableCell className="flex gap-1">
                          {!m.is_archived && (
                            <Button variant="ghost" size="icon" onClick={() => setEditingMeter(m)} title="Bearbeiten">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {m.is_archived ? (
                            <Button variant="ghost" size="icon" onClick={() => archiveMeter(m.id, false)} title="Wiederherstellen">
                              <ArchiveRestore className="h-4 w-4 text-primary" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => archiveMeter(m.id, true)} title="Archivieren">
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          {m.is_archived && (
                            <Button variant="ghost" size="icon" onClick={() => deleteMeter(m.id)} title="Endgültig löschen">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Sensoren Tab */}
          <TabsContent value="sensors" className="space-y-4">
            {sensorsLoading || intLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : gatewayIntegrations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Keine Gateway-Integration verbunden. Sensoren werden über verbundene Integrationen automatisch erkannt.
              </p>
            ) : (
              <DeviceTable devices={sensorDevices} type="sensor" />
            )}
          </TabsContent>

          {/* Aktoren Tab */}
          <TabsContent value="actuators" className="space-y-4">
            {sensorsLoading || intLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : gatewayIntegrations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Keine Gateway-Integration verbunden. Aktoren werden über verbundene Integrationen automatisch erkannt.
              </p>
            ) : (
              <DeviceTable devices={actuatorDevices} type="actuator" />
            )}
          </TabsContent>

          <TabsContent value="tree" className="space-y-4">
            <MeterTreeView
              meters={meters}
              onUpdateParent={updateMeterParent}
              onSelectMeter={(meter) => setEditingMeter(meter)}
            />
            <MeterAggregationWidget meters={meters} readings={readings} />
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            {isAdmin && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setAlertDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> {t("mm.addAlert" as any)}
                </Button>
              </div>
            )}
            {rulesLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : alertRules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t("mm.noAlerts" as any)}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead>{t("common.name" as any)}</TableHead>
                     <TableHead>{t("mm.energyType" as any)}</TableHead>
                     <TableHead>{t("mm.threshold" as any)}</TableHead>
                     <TableHead>{t("mm.timeUnit" as any)}</TableHead>
                     <TableHead>{t("common.status" as any)}</TableHead>
                     <TableHead>{t("common.active" as any)}</TableHead>
                     {isAdmin && <TableHead className="w-24" />}
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {alertRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ENERGY_BADGE_CLASSES[r.energy_type] || ""}>{ENERGY_TYPE_LABELS[r.energy_type] || r.energy_type}</Badge>
                      </TableCell>
                      <TableCell>{r.threshold_value} {r.threshold_unit || "kWh"}</TableCell>
                       <TableCell>{TIME_UNIT_KEYS[r.time_unit] ? t(TIME_UNIT_KEYS[r.time_unit] as any) : r.time_unit}</TableCell>
                       <TableCell>{r.threshold_type === "above" ? t("mm.thresholdAbove" as any) : t("mm.thresholdBelow" as any)}</TableCell>
                      <TableCell>
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(checked) => toggleAlertRule(r.id, checked)}
                          disabled={!isAdmin}
                        />
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditingRule(r)} title="Bearbeiten">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteAlertRule(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>

        <AddMeterDialog
          locationId={locationId}
          open={meterDialogOpen}
          onOpenChange={setMeterDialogOpen}
        />
        {editingMeter && (
          <EditMeterDialog
            meter={editingMeter}
            open={!!editingMeter}
            onOpenChange={(open) => { if (!open) setEditingMeter(null); }}
            onSave={async (id, updates) => { await updateMeter(id, updates); }}
          />
        )}
        <AddAlertRuleDialog
          locationId={locationId}
          open={alertDialogOpen}
          onOpenChange={setAlertDialogOpen}
        />
        {editingRule && (
          <EditAlertRuleDialog
            rule={editingRule}
            open={!!editingRule}
            onOpenChange={(open) => { if (!open) setEditingRule(null); }}
            onSave={async (id, updates) => { await updateAlertRule(id, updates as any); setEditingRule(null); }}
          />
        )}
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
  );
};
