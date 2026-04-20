import { useState, useMemo, useEffect } from "react";
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
  Activity, Server, Zap, Inbox,
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
import { filterAssignedGatewayDevices } from "@/lib/gatewayDeviceFiltering";

interface MeterManagementProps {
  locationId: string;
}

const TIME_UNIT_KEYS: Record<string, string> = {
  hour: "mm.timeHour",
  day: "mm.timeDay",
  week: "mm.timeWeek",
  month: "mm.timeMonth",
};

const METER_CONTROL_TYPES = ["Meter", "EnergyManager", "EnergyManager2", "Fronius", "EnergyMonitor"];

function isMeterDevice(sensor: LoxoneSensor): boolean {
  return METER_CONTROL_TYPES.includes(sensor.controlType);
}

function isActuator(sensor: LoxoneSensor): boolean {
  if (isMeterDevice(sensor)) return false;
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
  return !isMeterDevice(sensor) && !isActuator(sensor);
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

function DeviceTable({
  devices,
  type,
  meters,
  onEditMeter,
  onCreateAndEdit,
  onArchive,
  onDelete,
  showArchived,
  isAdmin,
}: {
  devices: (LoxoneSensor & { _integrationLabel: string; _integrationId: string })[];
  type: "sensor" | "actuator";
  meters: Meter[];
  onEditMeter: (meter: Meter) => void;
  onCreateAndEdit: (device: LoxoneSensor & { _integrationId: string }, deviceType: string) => void;
  onArchive?: (meter: Meter, archive: boolean) => void;
  onDelete?: (meter: Meter) => void;
  showArchived?: boolean;
  isAdmin?: boolean;
}) {
  if (devices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {type === "sensor" ? "Keine Sensoren gefunden." : "Keine Aktoren gefunden."}
      </p>
    );
  }

  const sensorUuidToMeter = new Map<string, Meter>();
  meters.forEach((m) => { if (m.sensor_uuid) sensorUuidToMeter.set(m.sensor_uuid, m); });

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
        {devices.map((d) => {
          const linkedMeter = sensorUuidToMeter.get(d.id);
          return (
            <TableRow key={`${d._integrationLabel}-${d.id}`}>
              <TableCell>
                <div className="p-1.5 rounded bg-muted w-fit">
                  {d.unit ? getUnitIcon(d.unit) : getSensorIcon(d.type)}
                </div>
              </TableCell>
              <TableCell>
                <button
                  className="font-medium text-left hover:underline text-primary cursor-pointer"
                  onClick={() => {
                    if (linkedMeter) {
                      onEditMeter(linkedMeter);
                    } else {
                      onCreateAndEdit(d, type === "actuator" ? "actuator" : "sensor");
                    }
                  }}
                >
                  {d.name}
                </button>
              </TableCell>
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
          );
        })}
      </TableBody>
    </Table>
  );
}

export const MeterManagement = ({ locationId }: MeterManagementProps) => {
  const { meters, loading: metersLoading, addMeter, deleteMeter, updateMeter, archiveMeter, updateMeterParent, refetch } = useMeters(locationId);
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
  const [pendingSensorUuid, setPendingSensorUuid] = useState<string | null>(null);

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
    const result: (LoxoneSensor & { _integrationLabel: string; _integrationId: string })[] = [];
    sensorQueries.forEach((q, idx) => {
      const intId = integrationIds[idx];
      const label = integrationLabelMap[intId] || "Unknown";
      (q.data || []).forEach((s) => result.push({
        ...s,
        name: sensorNameMap[s.id] || s.name,
        _integrationLabel: label,
        _integrationId: intId,
      }));
    });
    return result;
  }, [sensorQueries, integrationIds, integrationLabelMap, sensorNameMap]);

  // Build map: sensor_uuid → device_type from DB (authoritative override)
  const dbDeviceTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    meters.forEach((m) => {
      if (m.sensor_uuid && (m as any).device_type) {
        map.set(m.sensor_uuid, (m as any).device_type);
      }
    });
    return map;
  }, [meters]);

  // Resolve effective device type: DB override first, then heuristic fallback
  const getEffectiveType = (d: LoxoneSensor): "meter" | "sensor" | "actuator" => {
    const dbType = dbDeviceTypeMap.get(d.id);
    if (dbType === "meter" || dbType === "sensor" || dbType === "actuator") return dbType;
    if (isMeterDevice(d)) return "meter";
    if (isActuator(d)) return "actuator";
    return "sensor";
  };

  const sensorDevices = useMemo(() => allDevicesWithSource.filter((d) => getEffectiveType(d) === "sensor"), [allDevicesWithSource, dbDeviceTypeMap]);
  const actuatorDevices = useMemo(() => allDevicesWithSource.filter((d) => getEffectiveType(d) === "actuator"), [allDevicesWithSource, dbDeviceTypeMap]);
  const meterDevices = useMemo(() => allDevicesWithSource.filter((d) => getEffectiveType(d) === "meter"), [allDevicesWithSource, dbDeviceTypeMap]);

  // Set of sensor_uuids present in gateway device lists – used to deduplicate
  const gatewayDeviceIds = useMemo(() => {
    const set = new Set<string>();
    allDevicesWithSource.forEach((d) => set.add(d.id));
    return set;
  }, [allDevicesWithSource]);

  const activeMeters = meters.filter((m) => !m.is_archived);
  const archivedMeters = meters.filter((m) => m.is_archived);

  // Split meters by device_type for tab filtering
  // Exclude meters whose sensor_uuid is already shown in the gateway DeviceTable (deduplication)
  const meterTypeMeters = activeMeters.filter(
    (m) =>
      ((m as any).device_type === "meter" || !(m as any).device_type) &&
      !(m.sensor_uuid && gatewayDeviceIds.has(m.sensor_uuid)),
  );
  const sensorTypeMeters = activeMeters.filter((m) => (m as any).device_type === "sensor" && !(m.sensor_uuid && gatewayDeviceIds.has(m.sensor_uuid)));
  const actuatorTypeMeters = activeMeters.filter((m) => (m as any).device_type === "actuator" && !(m.sensor_uuid && gatewayDeviceIds.has(m.sensor_uuid)));

  // Archivierte, aufgeteilt nach Geräte-Typ
  const archivedMetersByType = archivedMeters.filter((m) => (m as any).device_type === "meter" || !(m as any).device_type);
  const archivedSensorsByType = archivedMeters.filter((m) => (m as any).device_type === "sensor");
  const archivedActuatorsByType = archivedMeters.filter((m) => (m as any).device_type === "actuator");

  const displayedMeters = showArchived ? archivedMetersByType : meterTypeMeters;
  const displayedSensors = showArchived ? archivedSensorsByType : sensorTypeMeters;
  const displayedActuators = showArchived ? archivedActuatorsByType : actuatorTypeMeters;

  const confirmDelete = (m: Meter) => {
    if (window.confirm(`Möchten Sie "${m.name}" endgültig löschen? Historische Messwerte bleiben erhalten, sind aber nicht mehr dieser Messstelle zugeordnet.`)) {
      deleteMeter(m.id);
    }
  };

  // Gateway-Devices, die der User über den "Gefundene Geräte"-Dialog aktiv
  // zugeordnet hat (= existieren als meters-Eintrag mit passender sensor_uuid).
  // Nur diese werden in den Tabs gelistet. Single source of truth:
  // src/lib/gatewayDeviceFiltering.ts
  const assignedMeterDevices = useMemo(
    () => filterAssignedGatewayDevices(meterDevices, meters),
    [meterDevices, meters],
  );
  const assignedActuatorDevices = useMemo(
    () => filterAssignedGatewayDevices(actuatorDevices, meters),
    [actuatorDevices, meters],
  );
  const assignedSensorDevices = useMemo(
    () => filterAssignedGatewayDevices(sensorDevices, meters),
    [sensorDevices, meters],
  );

  // Anzahl der noch nicht zugeordneten Gateway-Geräte – nur für den Hinweis-
  // Banner ("X neue Geräte verfügbar"), NICHT für die Listen-Anzeige.
  const unassignedDevicesCount = useMemo(() => {
    const assignedIds = new Set(meters.map((m) => m.sensor_uuid).filter(Boolean));
    return allDevicesWithSource.filter((d) => !assignedIds.has(d.id)).length;
  }, [allDevicesWithSource, meters]);

  const scrollToIntegrations = () => {
    const el = document.getElementById("location-integrations");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // When a new meter is created for a gateway device, watch for it to appear and open edit
  useEffect(() => {
    if (!pendingSensorUuid) return;
    const found = meters.find((m) => m.sensor_uuid === pendingSensorUuid);
    if (found) {
      setEditingMeter(found);
      setPendingSensorUuid(null);
    }
  }, [meters, pendingSensorUuid]);

  // Auto-create a meter record for a gateway device and open the edit dialog
  const handleCreateAndEdit = async (device: LoxoneSensor & { _integrationId: string }, deviceType: string) => {
    setPendingSensorUuid(device.id);
    await addMeter(
      {
        name: device.name,
        location_id: locationId,
        energy_type: isMeterDevice(device) ? "strom" : "none",
        unit: device.unit || "",
        capture_type: "automatic",
        location_integration_id: device._integrationId,
        sensor_uuid: device.id,
        device_type: deviceType,
      },
      null, false, "consumption"
    );
  };

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
            <TabsTrigger value="meters">{t("mm.tabs.meters" as any)} ({meterTypeMeters.length + assignedMeterDevices.length})</TabsTrigger>
            <TabsTrigger value="sensors">Sensoren ({assignedSensorDevices.length + sensorTypeMeters.length})</TabsTrigger>
            <TabsTrigger value="actuators">Aktoren ({assignedActuatorDevices.length + actuatorTypeMeters.length})</TabsTrigger>
            <TabsTrigger value="tree" className="gap-1">
              <Network className="h-3.5 w-3.5" />
              {t("mm.tabs.tree" as any)}
            </TabsTrigger>
            <TabsTrigger value="alerts">{t("mm.tabs.alerts" as any)} ({alertRules.length})</TabsTrigger>
          </TabsList>

          {unassignedDevicesCount > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Inbox className="h-4 w-4 text-primary" />
                <span>
                  <strong>{unassignedDevicesCount}</strong> neue Geräte vom Gateway verfügbar – noch keinem Standort zugeordnet.
                </span>
              </div>
              <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={scrollToIntegrations}>
                Jetzt zuordnen →
              </Button>
            </div>
          )}

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
                       <TableCell>
                         <button
                           className="font-medium text-left hover:underline text-primary cursor-pointer"
                           onClick={() => setEditingMeter(m)}
                         >
                           {m.name}
                         </button>
                       </TableCell>
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
                            <Button variant="ghost" size="icon" onClick={() => confirmDelete(m)} title="Endgültig löschen">
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

            {/* Vom User zugeordnete Gateway-Devices vom Typ "Zähler" */}
            {assignedMeterDevices.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground">
                  Vom Gateway gelieferte Zähler-Geräte – klicken Sie auf einen Eintrag, um die zugehörige Messstelle zu bearbeiten.
                </p>
                <DeviceTable
                  devices={assignedMeterDevices}
                  type="sensor"
                  meters={meters}
                  onEditMeter={(m) => setEditingMeter(m)}
                  onCreateAndEdit={(d) => handleCreateAndEdit(d, "meter")}
                />
              </div>
            )}
          </TabsContent>

          {/* Sensoren Tab */}
          <TabsContent value="sensors" className="space-y-4">
            {(archivedSensorsByType.length > 0 || showArchived) && (
              <div className="flex items-center">
                <Button variant={showArchived ? "outline" : "ghost"} size="sm" className="gap-1.5 text-xs" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {showArchived ? `Aktive anzeigen (${sensorTypeMeters.length})` : `Archiv (${archivedSensorsByType.length})`}
                </Button>
              </div>
            )}
            {displayedSensors.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name" as any)}</TableHead>
                    <TableHead>{t("mm.captureType" as any)}</TableHead>
                    <TableHead>Notizen</TableHead>
                    {isAdmin && <TableHead className="w-32" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedSensors.map((m) => (
                    <TableRow key={m.id} className={m.is_archived ? "opacity-60" : ""}>
                      <TableCell>
                        <button className="font-medium text-left hover:underline text-primary cursor-pointer" onClick={() => setEditingMeter(m)}>
                          {m.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.capture_type === "automatic" ? "default" : "secondary"}>
                          {m.capture_type === "automatic" ? t("mm.captureAutomatic" as any) : t("mm.captureManual" as any)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.notes || "–"}</TableCell>
                      {isAdmin && (
                        <TableCell className="flex gap-1">
                          {!m.is_archived && (
                            <Button variant="ghost" size="icon" onClick={() => setEditingMeter(m)} title="Bearbeiten">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {m.is_archived ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => archiveMeter(m.id, false)} title="Wiederherstellen">
                                <ArchiveRestore className="h-4 w-4 text-primary" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => confirmDelete(m)} title="Endgültig löschen">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => archiveMeter(m.id, true)} title="Archivieren">
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {sensorsLoading || intLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : gatewayIntegrations.length === 0 && sensorTypeMeters.length === 0 && assignedSensorDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Keine Sensoren vorhanden.</p>
            ) : assignedSensorDevices.length > 0 ? (
              <DeviceTable devices={assignedSensorDevices} type="sensor" meters={meters} onEditMeter={(m) => setEditingMeter(m)} onCreateAndEdit={handleCreateAndEdit} />
            ) : null}
          </TabsContent>

          {/* Aktoren Tab */}
          <TabsContent value="actuators" className="space-y-4">
            {(archivedActuatorsByType.length > 0 || showArchived) && (
              <div className="flex items-center">
                <Button variant={showArchived ? "outline" : "ghost"} size="sm" className="gap-1.5 text-xs" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {showArchived ? `Aktive anzeigen (${actuatorTypeMeters.length})` : `Archiv (${archivedActuatorsByType.length})`}
                </Button>
              </div>
            )}
            {displayedActuators.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name" as any)}</TableHead>
                    <TableHead>{t("mm.captureType" as any)}</TableHead>
                    <TableHead>Notizen</TableHead>
                    {isAdmin && <TableHead className="w-32" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedActuators.map((m) => (
                    <TableRow key={m.id} className={m.is_archived ? "opacity-60" : ""}>
                      <TableCell>
                        <button className="font-medium text-left hover:underline text-primary cursor-pointer" onClick={() => setEditingMeter(m)}>
                          {m.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.capture_type === "automatic" ? "default" : "secondary"}>
                          {m.capture_type === "automatic" ? t("mm.captureAutomatic" as any) : t("mm.captureManual" as any)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.notes || "–"}</TableCell>
                      {isAdmin && (
                        <TableCell className="flex gap-1">
                          {!m.is_archived && (
                            <Button variant="ghost" size="icon" onClick={() => setEditingMeter(m)} title="Bearbeiten">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {m.is_archived ? (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => archiveMeter(m.id, false)} title="Wiederherstellen">
                                <ArchiveRestore className="h-4 w-4 text-primary" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => confirmDelete(m)} title="Endgültig löschen">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          ) : (
                            <Button variant="ghost" size="icon" onClick={() => archiveMeter(m.id, true)} title="Archivieren">
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {sensorsLoading || intLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : gatewayIntegrations.length === 0 && actuatorTypeMeters.length === 0 && assignedActuatorDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Keine Aktoren vorhanden.</p>
            ) : assignedActuatorDevices.length > 0 ? (
              <DeviceTable devices={assignedActuatorDevices} type="actuator" meters={meters} onEditMeter={(m) => setEditingMeter(m)} onCreateAndEdit={handleCreateAndEdit} />
            ) : null}
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
