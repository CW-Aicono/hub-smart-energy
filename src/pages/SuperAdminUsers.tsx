import { Navigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, User, UserCheck, UserX, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SuperAdminInviteDialog from "@/components/super-admin/SuperAdminInviteDialog";
import EditSAUserDialog from "@/components/super-admin/EditSAUserDialog";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

interface PlatformUser {
  id: string;
  user_id: string;
  email: string | null;
  contact_person: string | null;
  is_blocked: boolean;
  created_at: string;
  role: "admin" | "user" | "super_admin";
  partnerships: { partnerName: string; role: string }[];
}

type SortKey = "username" | "role" | "status" | "created_at";

const SuperAdminUsers = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useSATranslation();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .is("tenant_id", null);
      if (pErr) throw pErr;
      const { data: roles, error: rErr } = await supabase.from("user_roles").select("*");
      if (rErr) throw rErr;
      const { data: memberships, error: mErr } = await supabase
        .from("partner_members")
        .select("user_id, role, partners(name)");
      if (mErr) throw mErr;
      return (profiles || []).map((p: any): PlatformUser => {
        // A user can have several role rows – show the highest one
        const own = (roles || []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role);
        const role: PlatformUser["role"] = own.includes("super_admin") ? "super_admin" : own.includes("admin") ? "admin" : "user";
        const partnerships = (memberships || [])
          .filter((m: any) => m.user_id === p.user_id)
          .map((m: any) => ({ partnerName: m.partners?.name ?? "?", role: m.role as string }));
        return { id: p.id, user_id: p.user_id, email: p.email, contact_person: p.contact_person, is_blocked: p.is_blocked, created_at: p.created_at, role, partnerships };
      });
    },
  });

  const filtered = users.filter((u) =>
    (u.email?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (u.contact_person?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const { sorted, sort, toggle } = useSortableData<PlatformUser, SortKey>(filtered, (r, k) => {
    switch (k) {
      case "username": return r.contact_person ?? r.email ?? "";
      case "role": return r.role;
      case "status": return r.is_blocked ? "blocked" : "active";
      case "created_at": return r.created_at ? new Date(r.created_at) : null;
      default: return null;
    }
  }, { key: "username", direction: "asc" });

  const toggleBlock = useMutation({
    mutationFn: async ({ userId, blocked }: { userId: string; blocked: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_blocked: !blocked }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["super-admin-users"] }); toast({ title: t("users.status_updated") }); },
    onError: () => { toast({ title: t("error.generic"), description: t("error.status_change"), variant: "destructive" }); },
  });

  const [deleteTarget, setDeleteTarget] = useState<PlatformUser | null>(null);
  const superAdminCount = users.filter((x) => x.role === "super_admin").length;
  const deleteUser = useMutation({
    mutationFn: async (target: PlatformUser) => {
      if (target.user_id === user?.id) throw new Error("Sie können Ihr eigenes Konto nicht löschen.");
      if (target.role === "super_admin" && superAdminCount <= 1) throw new Error("Der letzte Super-Admin kann nicht gelöscht werden.");
      const { data, error } = await supabase.functions.invoke("delete-user", { body: { userId: target.user_id } });
      if (error) {
        let msg = error.message;
        try { const body = await (error as any).context?.json?.(); if (body?.error) msg = body.error; } catch { /* ignore */ }
        throw new Error(msg);
      }
      if (data && data.success === false) throw new Error(data.error ?? "Löschen fehlgeschlagen");
    },
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["sa-super-admins"] });
      toast({ title: "Benutzer gelöscht" });
    },
    onError: (e: any) => { toast({ title: t("error.generic"), description: e?.message, variant: "destructive" }); },
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "user" | "super_admin" }) => {
      const { error } = await supabase.from("user_roles").update({ role }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["super-admin-users"] }); toast({ title: t("users.role_updated") }); },
    onError: () => { toast({ title: t("error.generic"), description: t("error.role_change"), variant: "destructive" }); },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{t("users.title")}</h1>
              <Badge variant="secondary">Nur Plattform-User</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t("users.subtitle")} — Mandanten-User werden ausschließlich in der jeweiligen Tenant-Benutzerverwaltung verwaltet.
            </p>
          </div>
          <SuperAdminInviteDialog />
        </header>
        <div className="p-6">
          <Input placeholder={t("users.search_placeholder")} onChange={(e) => setSearch(e.target.value)} className="max-w-sm mb-4" />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label={t("users.username")} sortKey="username" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("users.role")} sortKey="role" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("common.status")} sortKey="status" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("common.created")} sortKey="created_at" sort={sort} onToggle={toggle} />
                    <TableCell className="w-32">{t("common.actions")}</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
                  ) : sorted.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("users.not_found")}</TableCell></TableRow>
                  ) : (
                    sorted.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{u.contact_person || "–"}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                            {u.partnerships.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {u.partnerships.map((pm, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {pm.role === "partner_admin" ? "Partner-Admin" : "Partner-Mitglied"}: {pm.partnerName}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select value={u.role} onValueChange={(val: "admin" | "user" | "super_admin") => updateRole.mutate({ userId: u.user_id, role: val })}>
                            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user"><div className="flex items-center gap-2"><User className="h-3 w-3" /> {t("users.user")}</div></SelectItem>
                              <SelectItem value="admin"><div className="flex items-center gap-2"><Shield className="h-3 w-3" /> {t("users.admin")}</div></SelectItem>
                              <SelectItem value="super_admin"><div className="flex items-center gap-2"><Shield className="h-3 w-3 text-destructive" /> {t("users.super_admin")}</div></SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.is_blocked ? "destructive" : "default"}>
                            {u.is_blocked ? t("common.blocked") : t("common.active")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{new Date(u.created_at).toLocaleDateString("de-DE")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <EditSAUserDialog user={u} />
                            {(() => {
                              const isLastSA = u.role === "super_admin" && users.filter((x) => x.role === "super_admin" && !x.is_blocked).length <= 1;
                              const isSelf = u.user_id === user?.id;
                              const disabled = isLastSA && isSelf;
                              return (
                                <Button variant="ghost" size="icon"
                                  onClick={() => toggleBlock.mutate({ userId: u.user_id, blocked: u.is_blocked })}
                                  title={disabled ? t("users.last_sa_warning") : u.is_blocked ? t("users.unlock") : t("users.lock")}
                                  disabled={disabled && !u.is_blocked}
                                >
                                  {u.is_blocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                </Button>
                              );
                            })()}
                            {(() => {
                              const isSelf = u.user_id === user?.id;
                              const isLast = u.role === "super_admin" && superAdminCount <= 1;
                              const blocked = isSelf || isLast;
                              return (
                                <Button variant="ghost" size="icon" aria-label="Benutzer löschen"
                                  title={isSelf ? "Eigenes Konto kann nicht gelöscht werden" : isLast ? "Letzter Super-Admin kann nicht gelöscht werden" : "Benutzer löschen"}
                                  disabled={blocked || deleteUser.isPending}
                                  onClick={() => setDeleteTarget(u)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              );
                            })()}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Benutzer unwiderruflich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">{deleteTarget?.contact_person || "–"} ({deleteTarget?.email})</span>
              <span className="block mt-2">Möchten Sie diesen Benutzer wirklich unwiderruflich löschen? Konto, Profil und alle Rollen werden entfernt. Dies kann nicht rückgängig gemacht werden.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUser.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteTarget) deleteUser.mutate(deleteTarget); }}
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminUsers;
