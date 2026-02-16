import { useState } from "react";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useMeterReadings } from "@/hooks/useMeterReadings";
import { useAlertRules, AlertRule } from "@/hooks/useAlertRules";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Gauge, Plus, Pencil, Trash2, Archive, ArchiveRestore, Eye, EyeOff, Network, ChevronDown, ChevronRight } from "lucide-react";
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

const TIME_UNIT_LABELS: Record<string, string> = {
  hour: "Stunde",
  day: "Tag",
  week: "Woche",
  month: "Monat",
};

export const MeterManagement = ({ locationId }: MeterManagementProps) => {
  const { meters, loading: metersLoading, deleteMeter, updateMeter, archiveMeter, updateMeterParent } = useMeters(locationId);
  const { alertRules, loading: rulesLoading, deleteAlertRule, toggleAlertRule, updateAlertRule } = useAlertRules(locationId);
  const { readings } = useMeterReadings();
  const { isAdmin } = useUserRole();
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

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
              Messstellen und Sensoren
            </CardTitle>
          </button>
        </CollapsibleTrigger>
        <CardDescription className="ml-6">
          Verwalten Sie Zähler und Alarmregeln für diesen Standort
        </CardDescription>
      </CardHeader>
      <CollapsibleContent>
      <CardContent>
        <Tabs defaultValue="meters">
          <TabsList>
            <TabsTrigger value="meters">Zähler ({activeMeters.length})</TabsTrigger>
            <TabsTrigger value="tree" className="gap-1">
              <Network className="h-3.5 w-3.5" />
              Zählerstruktur
            </TabsTrigger>
            <TabsTrigger value="alerts">Alarmregeln ({alertRules.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="meters" className="space-y-4">
            <div className="flex items-center justify-between">
              {(archivedMeters.length > 0 || showArchived) && (
                <Button variant={showArchived ? "outline" : "ghost"} size="sm" className="gap-1.5 text-xs" onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {showArchived ? `Aktive anzeigen (${activeMeters.length})` : `Archiv anzeigen (${archivedMeters.length})`}
                </Button>
              )}
              <div className="flex-1" />
              {isAdmin && !showArchived && (
                <Button size="sm" onClick={() => setMeterDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Zähler anlegen
                </Button>
              )}
            </div>
            {metersLoading ? (
              <p className="text-sm text-muted-foreground">Laden...</p>
            ) : displayedMeters.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {showArchived ? "Keine archivierten Zähler." : "Keine Zähler angelegt."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Zählernummer</TableHead>
                    <TableHead>Erfassung</TableHead>
                    <TableHead>Energieart</TableHead>
                    <TableHead>Einheit</TableHead>
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
                          {m.capture_type === "automatic" ? "Automatisch" : m.capture_type === "virtual" ? "Virtuell" : "Manuell"}
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
                  <Plus className="h-4 w-4 mr-1" /> Alarmregel anlegen
                </Button>
              </div>
            )}
            {rulesLoading ? (
              <p className="text-sm text-muted-foreground">Laden...</p>
            ) : alertRules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Keine Alarmregeln definiert.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Energieart</TableHead>
                    <TableHead>Schwellenwert</TableHead>
                    <TableHead>Zeiteinheit</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Aktiv</TableHead>
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
                      <TableCell>{TIME_UNIT_LABELS[r.time_unit] || r.time_unit}</TableCell>
                      <TableCell>{r.threshold_type === "above" ? "Über" : "Unter"}</TableCell>
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
