import { useState } from "react";
import { useChargingUsers, useChargingUserGroups, ChargingUser } from "@/hooks/useChargingUsers";
import { useChargingTariffs } from "@/hooks/useChargingTariffs";
import { useTenant } from "@/hooks/useTenant";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MoreHorizontal, Edit, Trash2, Ban, Archive, Users, FolderOpen, Check, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";

const emptyUserForm = { name: "", email: "", rfid_tag: "", phone: "", group_id: "", tariff_id: "", notes: "" };
const emptyGroupForm = { name: "", description: "", is_app_user: false, tariff_id: "" };

const ChargingUsersTab = () => {
  const { tenant } = useTenant();
  const { isAdmin } = useUserRole();
  const { t } = useTranslation();
  const { users, isLoading: usersLoading, addUser, updateUser, deleteUser } = useChargingUsers();
  const { groups, isLoading: groupsLoading, addGroup, updateGroup, deleteGroup } = useChargingUserGroups();
  const { tariffs } = useChargingTariffs();

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ChargingUser | null>(null);
  const [userForm, setUserForm] = useState(emptyUserForm);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; description: string | null; is_app_user: boolean; tariff_id: string | null } | null>(null);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);

  const [deleteTarget, setDeleteTarget] = useState<{ type: "user" | "group"; id: string; name: string } | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked" | "archived">("all");

  const filteredUsers = statusFilter === "all" ? users : users.filter((u) => u.status === statusFilter);

  const getGroupName = (gid: string | null) => groups.find((g) => g.id === gid)?.name || "—";
  const getTariffName = (tid: string | null) => tariffs.find((t) => t.id === tid)?.name || null;

  /** Resolve effective tariff: user > group > default active */
  const getEffectiveTariff = (u: ChargingUser) => {
    if (u.tariff_id) return getTariffName(u.tariff_id);
    const group = groups.find((g) => g.id === u.group_id);
    if (group?.tariff_id) return getTariffName(group.tariff_id);
    const active = tariffs.find((t) => t.is_active);
    return active ? `${active.name} (Standard)` : "—";
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="default"><Check className="h-3 w-3 mr-1" />{t("cu.statusActive" as any)}</Badge>;
      case "blocked": return <Badge variant="destructive"><Ban className="h-3 w-3 mr-1" />{t("cu.statusBlocked" as any)}</Badge>;
      case "archived": return <Badge variant="secondary"><Archive className="h-3 w-3 mr-1" />{t("cu.statusArchived" as any)}</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // --- User CRUD ---
  const openAddUser = () => { setUserForm(emptyUserForm); setEditingUser(null); setUserDialogOpen(true); };
  const openEditUser = (u: ChargingUser) => {
    setUserForm({ name: u.name, email: u.email || "", rfid_tag: u.rfid_tag || "", phone: u.phone || "", group_id: u.group_id || "", tariff_id: u.tariff_id || "", notes: u.notes || "" });
    setEditingUser(u); setUserDialogOpen(true);
  };
  const handleSaveUser = () => {
    if (!tenant?.id) return;
    const payload = {
      name: userForm.name,
      email: userForm.email || undefined,
      rfid_tag: userForm.rfid_tag || undefined,
      phone: userForm.phone || undefined,
      group_id: userForm.group_id || null,
      tariff_id: userForm.tariff_id || null,
      notes: userForm.notes || undefined,
    };
    if (editingUser) { updateUser.mutate({ id: editingUser.id, ...payload }); } else { addUser.mutate({ tenant_id: tenant.id, ...payload }); }
    setUserDialogOpen(false);
  };
  const handleSetStatus = (id: string, status: string) => { updateUser.mutate({ id, status }); };

  // --- Group CRUD ---
  const openAddGroup = () => { setGroupForm(emptyGroupForm); setEditingGroup(null); setGroupDialogOpen(true); };
  const openEditGroup = (g: { id: string; name: string; description: string | null; is_app_user: boolean; tariff_id: string | null }) => {
    setGroupForm({ name: g.name, description: g.description || "", is_app_user: g.is_app_user, tariff_id: g.tariff_id || "" }); setEditingGroup(g); setGroupDialogOpen(true);
  };
  const handleSaveGroup = () => {
    if (!tenant?.id) return;
    const payload = {
      name: groupForm.name,
      description: groupForm.description || undefined,
      is_app_user: groupForm.is_app_user,
      tariff_id: groupForm.tariff_id || null,
    };
    if (editingGroup) { updateGroup.mutate({ id: editingGroup.id, ...payload } as any); }
    else { addGroup.mutate({ tenant_id: tenant.id, ...payload } as any); }
    setGroupDialogOpen(false);
  };
  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "user") deleteUser.mutate(deleteTarget.id);
    else deleteGroup.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  const tariffSelect = (value: string, onChange: (v: string) => void, label = "Tarif", required = false) => (
    <div>
      <Label>{label}{required ? " *" : ""}</Label>
      <Select value={value} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder={required ? "Tarif wählen…" : "Kein individueller Tarif"} /></SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value="__none__">Kein individueller Tarif</SelectItem>}
          {tariffs.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs defaultValue="user-list">
        <TabsList>
          <TabsTrigger value="user-list"><Users className="h-4 w-4 mr-1.5" />{t("cu.tabUsers" as any)}</TabsTrigger>
          <TabsTrigger value="user-groups"><FolderOpen className="h-4 w-4 mr-1.5" />{t("cu.tabGroups" as any)}</TabsTrigger>
        </TabsList>

        <TabsContent value="user-list">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("cu.title" as any)}</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("cu.statusAll" as any)}</SelectItem>
                    <SelectItem value="active">{t("cu.statusActive" as any)}</SelectItem>
                    <SelectItem value="blocked">{t("cu.statusBlocked" as any)}</SelectItem>
                    <SelectItem value="archived">{t("cu.statusArchived" as any)}</SelectItem>
                  </SelectContent>
                </Select>
                {isAdmin && (
                  <Button size="sm" onClick={openAddUser}><Plus className="h-4 w-4 mr-2" />{t("cu.addUser" as any)}</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <p className="text-muted-foreground">{t("common.loading")}</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-muted-foreground">{t("cu.noUsers" as any)}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.name" as any)}</TableHead>
                      <TableHead>{t("common.email" as any)}</TableHead>
                      <TableHead>{t("cu.rfidTag" as any)}</TableHead>
                      <TableHead>{t("cu.userGroup" as any)}</TableHead>
                      <TableHead>Tarif</TableHead>
                      <TableHead>{t("common.status" as any)}</TableHead>
                      <TableHead>{t("common.created" as any)}</TableHead>
                      {isAdmin && <TableHead className="w-16" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell>{u.email || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{u.rfid_tag || "—"}</TableCell>
                        <TableCell>{getGroupName(u.group_id)}</TableCell>
                        <TableCell className="text-sm">{getEffectiveTariff(u)}</TableCell>
                        <TableCell>{statusBadge(u.status)}</TableCell>
                        <TableCell>{format(new Date(u.created_at), "dd.MM.yyyy")}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditUser(u)}><Edit className="h-4 w-4 mr-2" />{t("common.edit")}</DropdownMenuItem>
                                {u.status !== "blocked" && (<DropdownMenuItem onClick={() => handleSetStatus(u.id, "blocked")}><Ban className="h-4 w-4 mr-2" />{t("cu.block" as any)}</DropdownMenuItem>)}
                                {u.status === "blocked" && (<DropdownMenuItem onClick={() => handleSetStatus(u.id, "active")}><Check className="h-4 w-4 mr-2" />{t("cu.unblock" as any)}</DropdownMenuItem>)}
                                {u.status !== "archived" && (<DropdownMenuItem onClick={() => handleSetStatus(u.id, "archived")}><Archive className="h-4 w-4 mr-2" />{t("cu.archive" as any)}</DropdownMenuItem>)}
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget({ type: "user", id: u.id, name: u.name })}><Trash2 className="h-4 w-4 mr-2" />{t("common.delete")}</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="user-groups">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("cu.groupsTitle" as any)}</CardTitle>
              {isAdmin && (<Button size="sm" onClick={openAddGroup}><Plus className="h-4 w-4 mr-2" />{t("cu.addGroup" as any)}</Button>)}
            </CardHeader>
            <CardContent>
              {groupsLoading ? (
                <p className="text-muted-foreground">{t("common.loading")}</p>
              ) : groups.length === 0 ? (
                <p className="text-muted-foreground">{t("cu.noGroups" as any)}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.name" as any)}</TableHead>
                      <TableHead>{t("common.description" as any)}</TableHead>
                      <TableHead>Tarif</TableHead>
                      <TableHead>{t("cu.appUser" as any)}</TableHead>
                      <TableHead>{t("cu.members" as any)}</TableHead>
                      <TableHead>{t("common.created" as any)}</TableHead>
                      {isAdmin && <TableHead className="w-24">{t("cu.actions" as any)}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((g) => {
                      const memberCount = users.filter((u) => u.group_id === g.id).length;
                      return (
                        <TableRow key={g.id}>
                          <TableCell className="font-medium">{g.name}</TableCell>
                          <TableCell>{g.description || "—"}</TableCell>
                          <TableCell className="text-sm">{getTariffName(g.tariff_id) || <span className="text-muted-foreground">Standard</span>}</TableCell>
                          <TableCell>
                            {g.is_app_user ? (<Badge variant="default" className="gap-1"><Smartphone className="h-3 w-3" />{t("cu.appUser" as any)}</Badge>) : (<span className="text-muted-foreground">—</span>)}
                          </TableCell>
                          <TableCell>{memberCount}</TableCell>
                          <TableCell>{format(new Date(g.created_at), "dd.MM.yyyy")}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditGroup(g)}><Edit className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "group", id: g.id, name: g.name })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUser ? t("cu.editUser" as any) : t("cu.newUser" as any)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("common.name" as any)} *</Label><Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("common.email" as any)}</Label><Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} /></div>
              <div><Label>{t("cu.phone" as any)}</Label><Input value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("cu.rfidTag" as any)}</Label><Input value={userForm.rfid_tag} onChange={(e) => setUserForm({ ...userForm, rfid_tag: e.target.value })} placeholder="z. B. AB12CD34" /></div>
              <div>
                <Label>{t("cu.userGroup" as any)} *</Label>
                <Select value={userForm.group_id} onValueChange={(v) => setUserForm({ ...userForm, group_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Gruppe wählen…" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {tariffSelect(userForm.tariff_id, (v) => setUserForm({ ...userForm, tariff_id: v }), "Individueller Tarif")}
            </div>
            <div><Label>{t("cu.notes" as any)}</Label><Textarea value={userForm.notes} onChange={(e) => setUserForm({ ...userForm, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveUser} disabled={!userForm.name || !userForm.group_id}>{editingUser ? t("common.save") : t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? t("cu.editGroup" as any) : t("cu.newGroup" as any)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("common.name" as any)} *</Label><Input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} /></div>
            <div><Label>{t("common.description" as any)}</Label><Textarea value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} rows={2} /></div>
            {tariffSelect(groupForm.tariff_id, (v) => setGroupForm({ ...groupForm, tariff_id: v }), "Gruppen-Tarif", true)}
            <div className="flex items-center justify-between">
              <Label>{t("cu.appUserGroup" as any)}</Label>
              <Switch checked={groupForm.is_app_user} onCheckedChange={(v) => setGroupForm({ ...groupForm, is_app_user: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveGroup} disabled={!groupForm.name || !groupForm.tariff_id}>{editingGroup ? t("common.save") : t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cu.deleteConfirm" as any)}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "user"
                ? t("cu.deleteUserMsg" as any).replace("{name}", deleteTarget?.name || "")
                : t("cu.deleteGroupMsg" as any).replace("{name}", deleteTarget?.name || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChargingUsersTab;
