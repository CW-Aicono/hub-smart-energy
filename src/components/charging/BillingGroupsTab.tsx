import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Edit, Trash2, Users, Building2, Mail, FileText, Send } from "lucide-react";
import {
  useChargingBillingGroups,
  useChargingBillingGroupMembers,
  useGenerateGroupInvoices,
  ChargingBillingGroup,
} from "@/hooks/useChargingBillingGroups";
import { useChargingUsers } from "@/hooks/useChargingUsers";

interface Props {
  isAdmin: boolean;
  periodStart?: string;
  periodEnd?: string;
  periodLabel?: string;
}

const emptyForm = { name: "", company_name: "", billing_email: "", billing_address: "", notes: "" };

export default function BillingGroupsTab({ isAdmin, periodStart, periodEnd, periodLabel }: Props) {
  const { groups, isLoading, createGroup, updateGroup, deleteGroup } = useChargingBillingGroups();
  const { users } = useChargingUsers();
  const generateGroupInvoices = useGenerateGroupInvoices();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<ChargingBillingGroup | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [membersGroup, setMembersGroup] = useState<ChargingBillingGroup | null>(null);

  const openCreate = () => {
    setEditGroup(null);
    setForm(emptyForm);
    setEditorOpen(true);
  };
  const openEdit = (g: ChargingBillingGroup) => {
    setEditGroup(g);
    setForm({
      name: g.name,
      company_name: g.company_name ?? "",
      billing_email: g.billing_email ?? "",
      billing_address: g.billing_address ?? "",
      notes: g.notes ?? "",
    });
    setEditorOpen(true);
  };

  const handleSave = () => {
    const payload = {
      name: form.name.trim(),
      company_name: form.company_name.trim() || null,
      billing_email: form.billing_email.trim() || null,
      billing_address: form.billing_address.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editGroup) {
      updateGroup.mutate({ id: editGroup.id, ...payload });
    } else {
      createGroup.mutate(payload);
    }
    setEditorOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Rechnungsgruppen</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Fasse mehrere Lade-Nutzer (z. B. alle Mitarbeiter einer Firma) zu einer Sammelrechnung an einen Rechnungsempfänger zusammen.
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Neue Gruppe
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Lädt…</p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Rechnungsgruppen vorhanden.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gruppe</TableHead>
                <TableHead>Rechnungsempfänger</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead className="text-center">Mitglieder</TableHead>
                {isAdmin && <TableHead className="w-40 text-right">Aktionen</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>
                    {g.company_name ? (
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {g.company_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {g.billing_email ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {g.billing_email}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{g.member_count ?? 0}</Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setMembersGroup(g)}>
                          <Users className="h-4 w-4 mr-1" />
                          Mitglieder
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Rechnungsgruppe „${g.name}" wirklich löschen?`)) {
                              deleteGroup.mutate(g.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editGroup ? "Rechnungsgruppe bearbeiten" : "Neue Rechnungsgruppe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Gruppenname *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="z. B. ACME GmbH"
              />
            </div>
            <div>
              <Label>Rechnungsempfänger / Firma</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Firmenname"
              />
            </div>
            <div>
              <Label>Rechnungs-E-Mail</Label>
              <Input
                type="email"
                value={form.billing_email}
                onChange={(e) => setForm({ ...form, billing_email: e.target.value })}
                placeholder="rechnung@firma.de"
              />
            </div>
            <div>
              <Label>Rechnungsadresse</Label>
              <Textarea
                rows={3}
                value={form.billing_address}
                onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
                placeholder="Straße, PLZ, Ort"
              />
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {editGroup ? "Speichern" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <MembersDialog
        group={membersGroup}
        onClose={() => setMembersGroup(null)}
        users={users}
      />
    </Card>
  );
}

function MembersDialog({
  group,
  onClose,
  users,
}: {
  group: ChargingBillingGroup | null;
  onClose: () => void;
  users: any[];
}) {
  const { memberUserIds, setMembers } = useChargingBillingGroupMembers(group?.id ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (group) {
      setSelected(new Set(memberUserIds));
    } else {
      setSelected(new Set());
      setSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id, memberUserIds.join(",")]);


  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.rfid_tag?.toLowerCase().includes(q)
    );
  });

  const handleSave = () => {
    setMembers.mutate(Array.from(selected), {
      onSuccess: () => onClose(),
    });
  };

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Mitglieder verwalten — {group?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Nach Name, E-Mail oder RFID suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ScrollArea className="h-80 border rounded-md">
            <div className="p-2 space-y-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Keine Nutzer gefunden.</p>
              ) : (
                filtered.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(u.id)}
                      onCheckedChange={() => toggle(u.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {u.email || u.rfid_tag || "—"}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </ScrollArea>
          <p className="text-xs text-muted-foreground">
            {selected.size} Nutzer ausgewählt
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={setMembers.isPending}>
            {setMembers.isPending ? "Speichert…" : "Mitglieder speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
