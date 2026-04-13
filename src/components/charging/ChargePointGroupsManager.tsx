import { useState } from "react";
import { useChargePointGroups, ChargePointGroup, ChargePointGroupEnergySettings, ChargePointGroupAccessSettings } from "@/hooks/useChargePointGroups";
import { useChargePoints } from "@/hooks/useChargePoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, PlugZap, Users, Gauge, Shield, Info, Pencil, X, Check, Sun } from "lucide-react";
import { PowerLimitScheduler, PowerLimitSchedule, defaultPowerLimitSchedule } from "@/components/charging/PowerLimitScheduler";
import { AccessControlSettings, AccessSettings } from "@/components/charging/AccessControlSettings";
import GroupSolarChargingConfig from "@/components/charging/GroupSolarChargingConfig";

export function ChargePointGroupsManager({ isAdmin }: { isAdmin: boolean }) {
  const { groups, isLoading, createGroup, updateGroup, deleteGroup, assignChargePointToGroup } = useChargePointGroups();
  const { chargePoints } = useChargePoints();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<ChargePointGroup | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createGroup.mutate({ name: newName.trim(), description: newDesc.trim() || undefined }, {
      onSuccess: () => { setCreateOpen(false); setNewName(""); setNewDesc(""); },
    });
  };

  const handleOpenDetail = (group: ChargePointGroup) => {
    setSelectedGroup(group);
    setDetailOpen(true);
  };

  const getGroupMemberCount = (groupId: string) =>
    chargePoints.filter((cp) => (cp as any).group_id === groupId).length;

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" /> Ladepunkt-Gruppen
          </h2>
          <p className="text-sm text-muted-foreground">
            Gruppen bündeln Ladepunkte und steuern Energiemanagement &amp; Zugangssteuerung zentral.
          </p>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Gruppe erstellen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Neue Ladepunkt-Gruppe</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z.B. Parkdeck Ost" autoFocus /></div>
                <div><Label>Beschreibung (optional)</Label><Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} /></div>
                <Button onClick={handleCreate} disabled={!newName.trim() || createGroup.isPending} className="w-full">Erstellen</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Noch keine Gruppen vorhanden.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => {
            const memberCount = getGroupMemberCount(group.id);
            return (
              <Card key={group.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{group.name}</CardTitle>
                      {group.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{group.description}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Gruppe löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Die Gruppe „{group.name}" wird gelöscht. Die zugeordneten Ladepunkte werden nicht gelöscht, aber aus der Gruppe entfernt.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteGroup.mutate(group.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="gap-1 text-xs">
                      <PlugZap className="h-3 w-3" /> {memberCount} Ladepunkt{memberCount !== 1 ? "e" : ""}
                    </Badge>
                    {group.energy_settings.dynamic_load_management && (
                      <Badge variant="outline" className="gap-1 text-xs text-primary border-primary/30">
                        <Gauge className="h-3 w-3" /> Lastmgmt.
                      </Badge>
                    )}
                    {group.energy_settings.pv_surplus_charging && (
                      <Badge variant="outline" className="gap-1 text-xs border-yellow-500/30 text-yellow-600">
                        <Sun className="h-3 w-3" /> PV-Überschuss
                      </Badge>
                    )}
                    {group.access_settings.free_charging && (
                      <Badge variant="outline" className="gap-1 text-xs text-accent border-accent/30">
                        <Shield className="h-3 w-3" /> Freies Laden
                      </Badge>
                    )}
                  </div>
                  <Button size="sm" className="w-full" onClick={() => handleOpenDetail(group)}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Konfigurieren
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Group detail dialog */}
      {selectedGroup && (
        <ChargePointGroupDetail
          group={selectedGroup}
          open={detailOpen}
          onOpenChange={(v) => { setDetailOpen(v); if (!v) setSelectedGroup(null); }}
          chargePoints={chargePoints}
          isAdmin={isAdmin}
          onUpdate={updateGroup.mutate}
          onAssign={assignChargePointToGroup.mutate}
        />
      )}
    </div>
  );
}

interface GroupDetailProps {
  group: ChargePointGroup;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chargePoints: any[];
  isAdmin: boolean;
  onUpdate: (data: any) => void;
  onAssign: (data: { chargePointId: string; groupId: string | null }) => void;
}

function ChargePointGroupDetail({ group, open, onOpenChange, chargePoints, isAdmin, onUpdate, onAssign }: GroupDetailProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const [energy, setEnergy] = useState<ChargePointGroupEnergySettings>({ ...group.energy_settings });
  const [access, setAccess] = useState<ChargePointGroupAccessSettings>({ ...group.access_settings });
  const [energySaved, setEnergySaved] = useState(false);
  const [accessSaved, setAccessSaved] = useState(false);
  const [powerLimit, setPowerLimit] = useState<PowerLimitSchedule>(
    (group.energy_settings as any).power_limit_schedule ?? defaultPowerLimitSchedule
  );

  const members = chargePoints.filter((cp) => cp.group_id === group.id);
  const nonMembers = chargePoints.filter((cp) => !cp.group_id || cp.group_id === group.id);

  const handleSaveEnergy = () => {
    onUpdate({ id: group.id, energy_settings: { ...energy, power_limit_schedule: powerLimit } });
    setEnergySaved(true);
    setTimeout(() => setEnergySaved(false), 2000);
  };

  const handleSaveAccess = () => {
    onUpdate({ id: group.id, access_settings: access });
    setAccessSaved(true);
    setTimeout(() => setAccessSaved(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {editingName ? (
              <div className="flex items-center gap-1 flex-1">
                <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-7 font-semibold" autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { onUpdate({ id: group.id, name: nameDraft }); setEditingName(false); }
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { onUpdate({ id: group.id, name: nameDraft }); setEditingName(false); }}><Check className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingName(false)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ) : (
              <DialogTitle
                className="cursor-pointer hover:text-primary transition-colors flex items-center gap-1 group"
                onClick={() => { setNameDraft(group.name); setEditingName(true); }}
              >
                {group.name}
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
              </DialogTitle>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="members">
          <TabsList className="w-full">
            <TabsTrigger value="members" className="flex-1 gap-1.5 text-xs"><PlugZap className="h-3.5 w-3.5" />Ladepunkte ({members.length})</TabsTrigger>
            <TabsTrigger value="energy" className="flex-1 gap-1.5 text-xs"><Gauge className="h-3.5 w-3.5" />Energiemanagement</TabsTrigger>
            <TabsTrigger value="access" className="flex-1 gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" />Zugangssteuerung</TabsTrigger>
          </TabsList>

          {/* Members tab */}
          <TabsContent value="members" className="mt-4 space-y-4">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Noch keine Ladepunkte in dieser Gruppe.</p>
            ) : (
              <div className="space-y-2">
                {members.map((cp) => (
                  <div key={cp.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{cp.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{cp.ocpp_id}</p>
                    </div>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive text-xs"
                        onClick={() => onAssign({ chargePointId: cp.id, groupId: null })}>
                        <X className="h-3.5 w-3.5 mr-1" />Entfernen
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isAdmin && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ladepunkt hinzufügen</Label>
                  <Select onValueChange={(cpId) => onAssign({ chargePointId: cpId, groupId: group.id })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ladepunkt wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {chargePoints
                        .filter((cp) => !cp.group_id)
                        .map((cp) => (
                          <SelectItem key={cp.id} value={cp.id}>
                            {cp.name} <span className="text-muted-foreground font-mono text-xs ml-1">({cp.ocpp_id})</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" /> Nur Ladepunkte ohne bestehende Gruppe werden angezeigt.
                  </p>
                </div>
              </>
            )}
          </TabsContent>

          {/* Energy tab */}
          <TabsContent value="energy" className="mt-4 space-y-4">
            {/* Power limit scheduler */}
            <PowerLimitScheduler
              value={powerLimit}
              onChange={setPowerLimit}
              onSave={handleSaveEnergy}
              disabled={!isAdmin}
            />

            <Separator />

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Dynamisches Lastmanagement</p>
                <p className="text-sm text-muted-foreground">Leistung automatisch an verfügbare Kapazität anpassen</p>
              </div>
              <Switch checked={energy.dynamic_load_management} onCheckedChange={(v) => setEnergy({ ...energy, dynamic_load_management: v })} disabled={!isAdmin} />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">PV-Überschussladen</p>
                <p className="text-sm text-muted-foreground">Laden priorisiert mit eigenem Solarstrom</p>
              </div>
              <Switch checked={energy.pv_surplus_charging} onCheckedChange={(v) => setEnergy({ ...energy, pv_surplus_charging: v })} disabled={!isAdmin} />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium">Günstig-Laden-Modus</p>
                <p className="text-sm text-muted-foreground">Laden automatisch in Niedrigtarifzeiten verschieben</p>
              </div>
              <Switch checked={energy.cheap_charging_mode} onCheckedChange={(v) => setEnergy({ ...energy, cheap_charging_mode: v })} disabled={!isAdmin} />
            </div>
            {isAdmin && (
              <Button onClick={handleSaveEnergy} variant={energySaved ? "outline" : "default"} className="gap-1.5">
                {energySaved ? <><Check className="h-3.5 w-3.5" />Gespeichert</> : "Weitere Einstellungen speichern"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" /> Diese Einstellungen gelten für alle Ladepunkte der Gruppe.
            </p>
          </TabsContent>

          {/* Access tab */}
          <TabsContent value="access" className="mt-4">
            <AccessControlSettings
              entityType="group"
              entityId={group.id}
              settings={access}
              isAdmin={isAdmin}
              onSave={(s) => {
                onUpdate({ id: group.id, access_settings: s });
                setAccessSaved(true);
                setTimeout(() => setAccessSaved(false), 2000);
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
