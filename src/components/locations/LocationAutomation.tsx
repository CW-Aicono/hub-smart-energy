import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  CheckCircle2,
} from "lucide-react";
import { useLocationIntegrations } from "@/hooks/useIntegrations";
import { useLoxoneSensors, LoxoneSensor } from "@/hooks/useLoxoneSensors";
import { useLocationAutomations, LocationAutomationRecord } from "@/hooks/useLocationAutomations";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

// Icon mapping for sensor types
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
  { value: "pulse", label: "Pulse (Taster)" },
  { value: "On", label: "Einschalten" },
  { value: "Off", label: "Ausschalten" },
  { value: "toggle", label: "Umschalten (Toggle)" },
];

interface LocationAutomationProps {
  locationId: string;
}

export const LocationAutomation = ({ locationId }: LocationAutomationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editAutomation, setEditAutomation] = useState<LocationAutomationRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocationAutomationRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formActuator, setFormActuator] = useState<LoxoneSensor | null>(null);
  const [formActionType, setFormActionType] = useState("pulse");
  const [saving, setSaving] = useState(false);

  const { locationIntegrations, loading: intLoading } = useLocationIntegrations(locationId);
  const loxoneIntegration = locationIntegrations.find(
    (li) => li.integration?.type?.startsWith("loxone") && li.is_enabled
  );
  const { data: sensors, isLoading: sensorsLoading } = useLoxoneSensors(loxoneIntegration?.id);
  const {
    automations, loading: autoLoading, executing,
    createAutomation, updateAutomation, deleteAutomation, executeAutomation,
  } = useLocationAutomations(locationId);

  const actuators = (sensors || []).filter(isActuator);

  const filteredActuators = searchTerm
    ? actuators.filter((s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.room.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.controlType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : actuators;

  const groupByRoom = (items: LoxoneSensor[]) => {
    const grouped: Record<string, LoxoneSensor[]> = {};
    items.forEach((s) => {
      const room = s.room || "Unbekannt";
      if (!grouped[room]) grouped[room] = [];
      grouped[room].push(s);
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  };

  const openAddDialog = () => {
    setFormName("");
    setFormDesc("");
    setFormActuator(null);
    setFormActionType("pulse");
    setAddOpen(true);
  };

  const openEditDialog = (auto: LocationAutomationRecord) => {
    setFormName(auto.name);
    setFormDesc(auto.description || "");
    setFormActionType(auto.action_value || auto.action_type);
    // Try to find actuator in loaded sensors
    const found = actuators.find((s) => s.id === auto.actuator_uuid);
    setFormActuator(found || null);
    setEditAutomation(auto);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Name ist erforderlich"); return; }
    if (!formActuator && !editAutomation) { toast.error("Bitte einen Aktor auswählen"); return; }
    if (!loxoneIntegration) return;

    setSaving(true);
    try {
      if (editAutomation) {
        const { error } = await updateAutomation(editAutomation.id, {
          name: formName,
          description: formDesc || undefined,
          action_type: formActionType === "pulse" ? "pulse" : "command",
          action_value: formActionType,
          ...(formActuator ? {
            actuator_uuid: formActuator.id,
            actuator_name: formActuator.name,
            actuator_control_type: formActuator.controlType,
          } : {}),
        });
        if (error) throw error;
        toast.success("Automation aktualisiert");
        setEditAutomation(null);
      } else {
        if (!formActuator) return;
        const { error } = await createAutomation({
          location_id: locationId,
          location_integration_id: loxoneIntegration.id,
          name: formName,
          description: formDesc || undefined,
          actuator_uuid: formActuator.id,
          actuator_name: formActuator.name,
          actuator_control_type: formActuator.controlType,
          action_type: formActionType === "pulse" ? "pulse" : "command",
          action_value: formActionType,
        });
        if (error) throw error;
        toast.success("Automation erstellt");
        setAddOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleExecute = async (auto: LocationAutomationRecord) => {
    const result = await executeAutomation(auto);
    if (result.success) {
      toast.success(`„${auto.name}" ausgeführt`);
    } else {
      toast.error(result.error || "Ausführung fehlgeschlagen");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteAutomation(deleteTarget.id);
    if (error) {
      toast.error("Fehler beim Löschen");
    } else {
      toast.success("Automation gelöscht");
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
                      Automation
                      {automations.length > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs">
                          {automations.filter((a) => a.is_active).length} aktiv
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Automatisierte Steuerungsszenarien für diesen Standort
                    </CardDescription>
                  </div>
                </button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="space-y-3">
              {/* Saved automations */}
              {autoLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : automations.length > 0 ? (
                automations.map((auto) => {
                  const Icon = getSensorIcon(
                    auto.actuator_control_type === "Pushbutton" ? "button" :
                    auto.actuator_control_type === "Switch" ? "switch" :
                    auto.actuator_control_type === "Dimmer" ? "light" : "unknown"
                  );
                  const isExecuting = executing === auto.id;
                  const actionLabel = ACTION_TYPES.find((a) => a.value === (auto.action_value || auto.action_type))?.label || auto.action_type;
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
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{auto.name}</p>
                          <Badge variant="outline" className="text-[10px]">{actionLabel}</Badge>
                        </div>
                        {auto.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{auto.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Server className="h-3 w-3" />
                            {auto.actuator_name}
                          </span>
                          {auto.last_executed_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(auto.last_executed_at), { addSuffix: true, locale: de })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleExecute(auto)}
                          disabled={isExecuting || !auto.is_active}
                          title="Jetzt ausführen"
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
                          onClick={() => openEditDialog(auto)}
                          title="Bearbeiten"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(auto)}
                          title="Löschen"
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
                  Noch keine Automationen konfiguriert.
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
                  Verfügbare Aktoren
                  {!intLoading && loxoneIntegration && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {actuators.length} Aktoren
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={openAddDialog}
                  disabled={!loxoneIntegration}
                >
                  <Plus className="h-4 w-4" />
                  Automation hinzufügen
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── Konfiguration Dialog ── */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Verfügbare Aktoren – Loxone Miniserver
            </DialogTitle>
            <DialogDescription>
              Steuerbare Aktoren des verbundenen Miniservers, die für Automationen genutzt werden können.
            </DialogDescription>
          </DialogHeader>

          {!loxoneIntegration ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Kein Loxone Miniserver mit diesem Standort verbunden.<br />
                Verbinden Sie einen Miniserver unter „Integrationen".
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
                placeholder="Suche nach Name, Raum oder Typ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9"
              />
              <Badge variant="secondary" className="gap-1">
                <ToggleLeft className="h-3 w-3" />
                {actuators.length} Aktoren (steuerbar)
              </Badge>
              {filteredActuators.length > 0 ? (
                <div className="space-y-2">
                  {groupByRoom(filteredActuators).map(([room, items]) => (
                    <div key={room} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground px-1">{room}</p>
                      {items.map((sensor) => {
                        const SIcon = getSensorIcon(sensor.type);
                        return (
                          <div
                            key={sensor.id}
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
              ) : (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  {searchTerm ? "Keine Ergebnisse für diese Suche." : "Keine steuerbaren Aktoren gefunden."}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Automation Dialog ── */}
      <Dialog open={addOpen || !!editAutomation} onOpenChange={(open) => { if (!open) { setAddOpen(false); setEditAutomation(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              {editAutomation ? "Automation bearbeiten" : "Neue Automation"}
            </DialogTitle>
            <DialogDescription>
              {editAutomation
                ? "Ändern Sie die Konfiguration dieser Automation."
                : "Wählen Sie einen Aktor und konfigurieren Sie die Aktion."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                placeholder="z.B. Flurbeleuchtung schalten"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Beschreibung</Label>
              <Textarea
                placeholder="Optionale Beschreibung..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
              />
            </div>

            {/* Actuator selection */}
            <div className="space-y-2">
              <Label>Aktor auswählen *</Label>
              {sensorsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : actuators.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Aktoren verfügbar.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  {actuators.map((sensor) => {
                    const SIcon = getSensorIcon(sensor.type);
                    const isSelected = formActuator?.id === sensor.id;
                    return (
                      <button
                        key={sensor.id}
                        type="button"
                        onClick={() => setFormActuator(sensor)}
                        className={`flex items-center gap-3 w-full p-3 text-left transition-colors border-b last:border-b-0 ${
                          isSelected
                            ? "bg-primary/10 border-primary/20"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className={`rounded-md p-1.5 ${isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                          <SIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{sensor.name}</p>
                          <p className="text-[11px] text-muted-foreground">{sensor.room} · {sensor.controlType}</p>
                        </div>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action type */}
            <div className="space-y-2">
              <Label>Aktion</Label>
              <Select value={formActionType} onValueChange={setFormActionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((at) => (
                    <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditAutomation(null); }}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editAutomation ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Automation löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleteTarget?.name}" wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
