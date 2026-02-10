import { useState } from "react";
import { useChargingUsers, useChargingUserGroups, ChargingUser } from "@/hooks/useChargingUsers";
import { useTenant } from "@/hooks/useTenant";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, MoreHorizontal, Edit, Trash2, Ban, Archive, Users, FolderOpen, Check } from "lucide-react";
import { format } from "date-fns";

const emptyUserForm = { name: "", email: "", rfid_tag: "", phone: "", group_id: "", notes: "" };
const emptyGroupForm = { name: "", description: "" };

const ChargingUsersTab = () => {
  const { tenant } = useTenant();
  const { isAdmin } = useUserRole();
  const { users, isLoading: usersLoading, addUser, updateUser, deleteUser } = useChargingUsers();
  const { groups, isLoading: groupsLoading, addGroup, updateGroup, deleteGroup } = useChargingUserGroups();

  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ChargingUser | null>(null);
  const [userForm, setUserForm] = useState(emptyUserForm);

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; description: string | null } | null>(null);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);

  const [deleteTarget, setDeleteTarget] = useState<{ type: "user" | "group"; id: string; name: string } | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked" | "archived">("all");

  const filteredUsers = statusFilter === "all" ? users : users.filter((u) => u.status === statusFilter);

  const getGroupName = (gid: string | null) => groups.find((g) => g.id === gid)?.name || "—";

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="default"><Check className="h-3 w-3 mr-1" />Aktiv</Badge>;
      case "blocked": return <Badge variant="destructive"><Ban className="h-3 w-3 mr-1" />Gesperrt</Badge>;
      case "archived": return <Badge variant="secondary"><Archive className="h-3 w-3 mr-1" />Archiviert</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // --- User CRUD ---
  const openAddUser = () => {
    setUserForm(emptyUserForm);
    setEditingUser(null);
    setUserDialogOpen(true);
  };

  const openEditUser = (u: ChargingUser) => {
    setUserForm({
      name: u.name,
      email: u.email || "",
      rfid_tag: u.rfid_tag || "",
      phone: u.phone || "",
      group_id: u.group_id || "",
      notes: u.notes || "",
    });
    setEditingUser(u);
    setUserDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (!tenant?.id) return;
    const payload = {
      name: userForm.name,
      email: userForm.email || undefined,
      rfid_tag: userForm.rfid_tag || undefined,
      phone: userForm.phone || undefined,
      group_id: userForm.group_id || null,
      notes: userForm.notes || undefined,
    };
    if (editingUser) {
      updateUser.mutate({ id: editingUser.id, ...payload });
    } else {
      addUser.mutate({ tenant_id: tenant.id, ...payload });
    }
    setUserDialogOpen(false);
  };

  const handleSetStatus = (id: string, status: string) => {
    updateUser.mutate({ id, status });
  };

  // --- Group CRUD ---
  const openAddGroup = () => {
    setGroupForm(emptyGroupForm);
    setEditingGroup(null);
    setGroupDialogOpen(true);
  };

  const openEditGroup = (g: { id: string; name: string; description: string | null }) => {
    setGroupForm({ name: g.name, description: g.description || "" });
    setEditingGroup(g);
    setGroupDialogOpen(true);
  };

  const handleSaveGroup = () => {
    if (!tenant?.id) return;
    if (editingGroup) {
      updateGroup.mutate({ id: editingGroup.id, name: groupForm.name, description: groupForm.description || undefined });
    } else {
      addGroup.mutate({ tenant_id: tenant.id, name: groupForm.name, description: groupForm.description || undefined });
    }
    setGroupDialogOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "user") deleteUser.mutate(deleteTarget.id);
    else deleteGroup.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="user-list">
        <TabsList>
          <TabsTrigger value="user-list"><Users className="h-4 w-4 mr-1.5" />Nutzer</TabsTrigger>
          <TabsTrigger value="user-groups"><FolderOpen className="h-4 w-4 mr-1.5" />Nutzergruppen</TabsTrigger>
        </TabsList>

        {/* Users list */}
        <TabsContent value="user-list">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Lade-Nutzer</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="blocked">Gesperrt</SelectItem>
                    <SelectItem value="archived">Archiviert</SelectItem>
                  </SelectContent>
                </Select>
                {isAdmin && (
                  <Button size="sm" onClick={openAddUser}><Plus className="h-4 w-4 mr-2" />Nutzer anlegen</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <p className="text-muted-foreground">Laden...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-muted-foreground">Keine Nutzer vorhanden.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>E-Mail</TableHead>
                      <TableHead>RFID-Tag</TableHead>
                      <TableHead>Gruppe</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erstellt</TableHead>
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
                        <TableCell>{statusBadge(u.status)}</TableCell>
                        <TableCell>{format(new Date(u.created_at), "dd.MM.yyyy")}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditUser(u)}>
                                  <Edit className="h-4 w-4 mr-2" />Bearbeiten
                                </DropdownMenuItem>
                                {u.status !== "blocked" && (
                                  <DropdownMenuItem onClick={() => handleSetStatus(u.id, "blocked")}>
                                    <Ban className="h-4 w-4 mr-2" />Sperren
                                  </DropdownMenuItem>
                                )}
                                {u.status === "blocked" && (
                                  <DropdownMenuItem onClick={() => handleSetStatus(u.id, "active")}>
                                    <Check className="h-4 w-4 mr-2" />Entsperren
                                  </DropdownMenuItem>
                                )}
                                {u.status !== "archived" && (
                                  <DropdownMenuItem onClick={() => handleSetStatus(u.id, "archived")}>
                                    <Archive className="h-4 w-4 mr-2" />Archivieren
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteTarget({ type: "user", id: u.id, name: u.name })}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />Löschen
                                </DropdownMenuItem>
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

        {/* Groups */}
        <TabsContent value="user-groups">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Nutzergruppen</CardTitle>
              {isAdmin && (
                <Button size="sm" onClick={openAddGroup}><Plus className="h-4 w-4 mr-2" />Gruppe anlegen</Button>
              )}
            </CardHeader>
            <CardContent>
              {groupsLoading ? (
                <p className="text-muted-foreground">Laden...</p>
              ) : groups.length === 0 ? (
                <p className="text-muted-foreground">Keine Nutzergruppen vorhanden.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Nutzer</TableHead>
                      <TableHead>Erstellt</TableHead>
                      {isAdmin && <TableHead className="w-24">Aktionen</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((g) => {
                      const memberCount = users.filter((u) => u.group_id === g.id).length;
                      return (
                        <TableRow key={g.id}>
                          <TableCell className="font-medium">{g.name}</TableCell>
                          <TableCell>{g.description || "—"}</TableCell>
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
            <DialogTitle>{editingUser ? "Nutzer bearbeiten" : "Neuer Lade-Nutzer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>E-Mail</Label>
                <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>RFID-Tag</Label>
                <Input value={userForm.rfid_tag} onChange={(e) => setUserForm({ ...userForm, rfid_tag: e.target.value })} placeholder="z. B. AB12CD34" />
              </div>
              <div>
                <Label>Nutzergruppe</Label>
                <Select value={userForm.group_id} onValueChange={(v) => setUserForm({ ...userForm, group_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Keine Gruppe" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Keine Gruppe</SelectItem>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea value={userForm.notes} onChange={(e) => setUserForm({ ...userForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSaveUser} disabled={!userForm.name}>{editingUser ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Gruppe bearbeiten" : "Neue Nutzergruppe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSaveGroup} disabled={!groupForm.name}>{editingGroup ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Löschen bestätigen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie {deleteTarget?.type === "user" ? "den Nutzer" : "die Gruppe"} „{deleteTarget?.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChargingUsersTab;
