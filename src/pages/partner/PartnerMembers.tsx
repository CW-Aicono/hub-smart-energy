import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserPlus, Trash2, Pencil, ShieldCheck, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

type PartnerRole = "partner_admin" | "partner_user";

interface PermFlags {
  can_manage_members: boolean;
  can_manage_branding: boolean;
  can_view_reporting: boolean;
  can_manage_tenants: boolean;
  can_manage_sales_catalog: boolean;
  can_create_tenant: boolean;
  can_view_billing: boolean;
  can_use_sales_scout: boolean;
}

interface MemberRow extends PermFlags {
  id: string;
  user_id: string;
  partner_role: PartnerRole;
  created_at: string;
  email?: string | null;
  contact_person?: string | null;
}

const PERMISSION_DEFS: Array<{ key: keyof PermFlags; label: string; hint: string }> = [
  { key: "can_manage_members",      label: "Mitglieder verwalten",   hint: "Andere Partner-User einladen, bearbeiten und entfernen" },
  { key: "can_manage_tenants",      label: "Tenants verwalten",      hint: "Eigene Tenants des Partners bearbeiten" },
  { key: "can_create_tenant",       label: "Tenants anlegen",        hint: "Neue Tenants im Partner-Portal erstellen" },
  { key: "can_manage_branding",     label: "Branding verwalten",     hint: "Whitelabel, Farben und Logo des Partners ändern" },
  { key: "can_view_reporting",      label: "Reporting ansehen",      hint: "Wachstums- und Aktivitäts-Reporting öffnen" },
  { key: "can_view_billing",        label: "Abrechnung ansehen",     hint: "Provisionen und Tenant-Rechnungen sehen" },
  { key: "can_manage_sales_catalog", label: "Geräte-Katalog & Regeln", hint: "Sales-Katalog und Auswahlregeln pflegen" },
  { key: "can_use_sales_scout",     label: "Sales Scout nutzen",     hint: "Zugriff auf das Sales-Scout-Modul" },
];

const EMPTY_PERMS: PermFlags = {
  can_manage_members: false,
  can_manage_branding: false,
  can_view_reporting: false,
  can_manage_tenants: false,
  can_manage_sales_catalog: false,
  can_create_tenant: false,
  can_view_billing: false,
  can_use_sales_scout: true,
};

export default function PartnerMembers() {
  const { partnerId, isPartnerAdmin, permissions } = usePartnerAccess();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = isPartnerAdmin || permissions.manageMembers;

  const [search, setSearch] = useState("");
  const filteredRows = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return (
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.contact_person ?? "").toLowerCase().includes(q) ||
          r.partner_role.toLowerCase().includes(q)
        );
      })
    : rows;
  const { sorted, sort, toggle } = useSortableData<MemberRow, "name" | "email" | "role" | "created_at">(filteredRows, (r, k) => {
    switch (k) {
      case "name": return r.contact_person ?? "";
      case "email": return r.email ?? "";
      case "role": return r.partner_role;
      case "created_at": return r.created_at ? new Date(r.created_at) : null;
      default: return null;
    }
  }, { key: "name", direction: "asc" });

  // Invite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [iEmail, setIEmail] = useState("");
  const [iName, setIName] = useState("");
  const [iRole, setIRole] = useState<PartnerRole>("partner_user");
  const [iPerms, setIPerms] = useState<PermFlags>(EMPTY_PERMS);

  // Edit
  const [editTarget, setEditTarget] = useState<MemberRow | null>(null);
  const [eRole, setERole] = useState<PartnerRole>("partner_user");
  const [ePerms, setEPerms] = useState<PermFlags>(EMPTY_PERMS);
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<MemberRow | null>(null);

  const adminCount = useMemo(
    () => rows.filter((r) => r.partner_role === "partner_admin").length,
    [rows],
  );

  const load = async () => {
    if (!partnerId) { setLoading(false); return; }
    setLoading(true);
    const { data: members } = await supabase
      .from("partner_members")
      .select("id, user_id, partner_role, created_at, can_manage_members, can_manage_branding, can_view_reporting, can_manage_tenants, can_manage_sales_catalog, can_create_tenant, can_view_billing, can_use_sales_scout")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: true });
    const list = (members as MemberRow[]) ?? [];

    if (list.length > 0) {
      const userIds = list.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, contact_person")
        .in("user_id", userIds);
      const byId = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      list.forEach((m) => {
        const p = byId.get(m.user_id);
        m.email = p?.email ?? null;
        m.contact_person = p?.contact_person ?? null;
      });
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [partnerId]);

  const openEdit = (m: MemberRow) => {
    setEditTarget(m);
    setERole(m.partner_role);
    setEPerms({
      can_manage_members: m.can_manage_members,
      can_manage_branding: m.can_manage_branding,
      can_view_reporting: m.can_view_reporting,
      can_manage_tenants: m.can_manage_tenants,
      can_manage_sales_catalog: m.can_manage_sales_catalog,
      can_create_tenant: m.can_create_tenant,
      can_view_billing: m.can_view_billing,
      can_use_sales_scout: m.can_use_sales_scout,
    });
  };

  const handleInvite = async () => {
    if (!iEmail) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("partner-invite-member", {
        body: {
          email: iEmail,
          name: iName || undefined,
          role: iRole,
          permissions: iRole === "partner_user" ? iPerms : undefined,
        },
      });
      const res: any = typeof data === "string" ? JSON.parse(data) : data;
      if (error || !res?.success) throw new Error(res?.error || error?.message || "Einladung fehlgeschlagen");
      toast({ title: "Einladung gesendet", description: `${iEmail} wurde eingeladen.` });
      setInviteOpen(false);
      setIEmail(""); setIName(""); setIRole("partner_user"); setIPerms(EMPTY_PERMS);
      await load();
    } catch (e: any) {
      toast({ title: "Fehler", description: e?.message ?? "Unbekannt", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const payload: any = { partner_role: eRole, ...ePerms };
      const { error } = await supabase
        .from("partner_members")
        .update(payload)
        .eq("id", editTarget.id);
      if (error) throw error;
      toast({ title: "Gespeichert" });
      setEditTarget(null);
      await load();
    } catch (e: any) {
      toast({ title: "Speichern fehlgeschlagen", description: e?.message ?? "Unbekannt", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: MemberRow) => {
    const { error } = await supabase.from("partner_members").delete().eq("id", m.id);
    if (error) {
      toast({ title: "Löschen fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Partner-User entfernt" });
    await load();
  };

  const isLastAdmin = (m: MemberRow) =>
    m.partner_role === "partner_admin" && adminCount <= 1;

  return (
    <TooltipProvider>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Partner-User</h1>
            <p className="text-muted-foreground">
              Mitglieder dieses Partners. Partner-Admins können Rollen und Rechte zuweisen.
            </p>
          </div>
          {canManage && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button><UserPlus className="h-4 w-4 mr-2" />User einladen</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Neuen Partner-User einladen</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>E-Mail *</Label>
                    <Input type="email" value={iEmail} onChange={(e) => setIEmail(e.target.value)} placeholder="kollege@partner.de" />
                  </div>
                  <div className="space-y-2">
                    <Label>Name (optional)</Label>
                    <Input value={iName} onChange={(e) => setIName(e.target.value)} placeholder="Anna Beispiel" />
                  </div>
                  <div className="space-y-2">
                    <Label>Rolle</Label>
                    <Select value={iRole} onValueChange={(v) => setIRole(v as PartnerRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="partner_user">Partner-User</SelectItem>
                        <SelectItem value="partner_admin">Partner-Admin (alle Rechte)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <PermissionsEditor
                    value={iPerms}
                    onChange={setIPerms}
                    disabled={iRole === "partner_admin"}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteOpen(false)}>Abbrechen</Button>
                  <Button onClick={handleInvite} disabled={inviting || !iEmail}>
                    {inviting ? "Sende…" : "Einladen"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </header>

        <Card>
          <CardHeader><CardTitle>Mitglieder</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Lade…</p>
            ) : sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Mitglieder.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Name" sortKey="name" sort={sort} onToggle={toggle} />
                    <SortableHead label="E-Mail" sortKey="email" sort={sort} onToggle={toggle} />
                    <SortableHead label="Rolle & Rechte" sortKey="role" sort={sort} onToggle={toggle} />
                    <SortableHead label="Beigetreten" sortKey="created_at" sort={sort} onToggle={toggle} />
                    <TableCell className="w-28 text-right">Aktionen</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((m) => {
                    const grantedCount = PERMISSION_DEFS.filter((d) => (m as any)[d.key]).length;
                    const lastAdmin = isLastAdmin(m);
                    const isSelf = m.user_id === user?.id;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.contact_person ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={m.partner_role === "partner_admin" ? "default" : "secondary"}>
                              {m.partner_role === "partner_admin" ? (
                                <><ShieldCheck className="h-3 w-3 mr-1" />Partner-Admin</>
                              ) : "Partner-User"}
                            </Badge>
                            {m.partner_role === "partner_user" && (
                              <Badge variant="outline" className="text-xs">
                                {grantedCount} Recht{grantedCount === 1 ? "" : "e"}
                              </Badge>
                            )}
                            {lastAdmin && (
                              <Badge variant="outline" className="text-xs">letzter Admin</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString("de-DE")}
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && (
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Bearbeiten</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive"
                                      disabled={lastAdmin || isSelf}
                                      onClick={() => setDeleteTarget(m)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isSelf
                                    ? "Eigenen Zugang nicht entfernbar"
                                    : lastAdmin
                                      ? "Der letzte Partner-Admin kann nicht entfernt werden"
                                      : "Entfernen"}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit dialog */}
        <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Mitglied bearbeiten</DialogTitle>
            </DialogHeader>
            {editTarget && (
              <div className="space-y-4 pt-2">
                <div className="text-sm text-muted-foreground">
                  {editTarget.contact_person ?? editTarget.email ?? "Unbenannt"}
                </div>
                <div className="space-y-2">
                  <Label>Rolle</Label>
                  <Select
                    value={eRole}
                    onValueChange={(v) => setERole(v as PartnerRole)}
                    disabled={isLastAdmin(editTarget)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="partner_user">Partner-User</SelectItem>
                      <SelectItem value="partner_admin">Partner-Admin (alle Rechte)</SelectItem>
                    </SelectContent>
                  </Select>
                  {isLastAdmin(editTarget) && (
                    <p className="text-xs text-muted-foreground">
                      Rolle kann nicht geändert werden – dies ist der letzte Partner-Admin.
                    </p>
                  )}
                </div>
                <Separator />
                <PermissionsEditor
                  value={ePerms}
                  onChange={setEPerms}
                  disabled={eRole === "partner_admin"}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)}>Abbrechen</Button>
              <Button onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Speichere…" : "Speichern"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Partner-User entfernen?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.email ?? deleteTarget?.contact_person ?? "Dieser Eintrag"} verliert
                den Zugriff auf das Partner-Portal. Der Auth-Account bleibt erhalten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <DialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteTarget && handleDelete(deleteTarget)}
              >
                Entfernen
              </AlertDialogAction>
            </DialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

function PermissionsEditor({ value, onChange, disabled }: {
  value: PermFlags;
  onChange: (v: PermFlags) => void;
  disabled: boolean;
}) {
  const toggle = (key: keyof PermFlags) => {
    if (disabled) return;
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div className="space-y-3">
      <Label className={disabled ? "opacity-50" : ""}>Berechtigungen</Label>
      <div className="grid gap-4 sm:grid-cols-2">
        {PERMISSION_DEFS.map((def) => (
          <div key={def.key} className="flex items-start space-x-3">
            <Checkbox
              id={`perm-${def.key}`}
              checked={disabled || value[def.key]}
              onCheckedChange={() => toggle(def.key)}
              disabled={disabled}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor={`perm-${def.key}`}
                className={`text-sm font-medium ${disabled ? "opacity-50" : "cursor-pointer"}`}
              >
                {def.label}
              </label>
              <p className="text-xs text-muted-foreground">{def.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
