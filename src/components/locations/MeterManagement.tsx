import { useState } from "react";
import { useMeters, Meter } from "@/hooks/useMeters";
import { useAlertRules } from "@/hooks/useAlertRules";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Gauge, Plus, Pencil, Trash2, Archive, ArchiveRestore, Eye, EyeOff } from "lucide-react";
import { AddMeterDialog } from "./AddMeterDialog";
import { EditMeterDialog } from "./EditMeterDialog";
import { AddAlertRuleDialog } from "./AddAlertRuleDialog";

interface MeterManagementProps {
  locationId: string;
}

const ENERGY_TYPE_LABELS: Record<string, string> = {
  strom: "Strom",
  gas: "Gas",
  waerme: "Wärme",
  wasser: "Wasser",
};

export const MeterManagement = ({ locationId }: MeterManagementProps) => {
  const { meters, loading: metersLoading, deleteMeter, updateMeter, archiveMeter } = useMeters(locationId);
  const { alertRules, loading: rulesLoading, deleteAlertRule, toggleAlertRule } = useAlertRules(locationId);
  const { isAdmin } = useUserRole();
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeMeters = meters.filter((m) => !m.is_archived);
  const archivedMeters = meters.filter((m) => m.is_archived);
  const displayedMeters = showArchived ? archivedMeters : activeMeters;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Messstellen & Alarmierung
        </CardTitle>
        <CardDescription>
          Verwalten Sie Zähler und Alarmregeln für diesen Standort
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="meters">
          <TabsList>
            <TabsTrigger value="meters">Zähler ({activeMeters.length})</TabsTrigger>
            <TabsTrigger value="alerts">Alarmregeln ({alertRules.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="meters" className="space-y-4">
            <div className="flex items-center justify-between">
              {archivedMeters.length > 0 && (
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setShowArchived(!showArchived)}>
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
                        <Badge variant={m.capture_type === "automatic" ? "default" : "secondary"}>
                          {m.capture_type === "automatic" ? "Automatisch" : "Manuell"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ENERGY_TYPE_LABELS[m.energy_type] || m.energy_type}</Badge>
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
                    <TableHead>Typ</TableHead>
                    <TableHead>Aktiv</TableHead>
                    {isAdmin && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ENERGY_TYPE_LABELS[r.energy_type] || r.energy_type}</Badge>
                      </TableCell>
                      <TableCell>{r.threshold_value}</TableCell>
                      <TableCell>{r.threshold_type === "above" ? "Über" : "Unter"}</TableCell>
                      <TableCell>
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(checked) => toggleAlertRule(r.id, checked)}
                          disabled={!isAdmin}
                        />
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
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
      </CardContent>
    </Card>
  );
};
