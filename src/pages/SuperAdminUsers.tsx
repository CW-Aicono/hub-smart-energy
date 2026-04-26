import { Navigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, User, UserCheck, UserX } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SuperAdminInviteDialog from "@/components/super-admin/SuperAdminInviteDialog";
import EditSAUserDialog from "@/components/super-admin/EditSAUserDialog";

interface PlatformUser {
  id: string;
  user_id: string;
  email: string | null;
  contact_person: string | null;
  is_blocked: boolean;
  created_at: string;
  role: "admin" | "user" | "super_admin";
}

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
      // STRIKTE TRENNUNG: Super-Admin-Bereich zeigt ausschließlich Plattform-User
      // (Profile OHNE tenant_id). Tenant-User werden ausschließlich in der
      // Tenant-Benutzerverwaltung angezeigt und verwaltet.
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .is("tenant_id", null);
      if (pErr) throw pErr;
      const { data: roles, error: rErr } = await supabase.from("user_roles").select("*");
      if (rErr) throw rErr;
      return (profiles || []).map((p: any): PlatformUser => {
        const userRole = roles?.find((r: any) => r.user_id === p.user_id);
        return { id: p.id, user_id: p.user_id, email: p.email, contact_person: p.contact_person, is_blocked: p.is_blocked, created_at: p.created_at, role: (userRole?.role as PlatformUser["role"]) ?? "user" };
      });
    },
  });

  const toggleBlock = useMutation({
    mutationFn: async ({ userId, blocked }: { userId: string; blocked: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_blocked: !blocked }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["super-admin-users"] }); toast({ title: t("users.status_updated") }); },
    onError: () => { toast({ title: t("error.generic"), description: t("error.status_change"), variant: "destructive" }); },
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

  const filtered = users.filter((u) =>
    (u.email?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (u.contact_person?.toLowerCase() || "").includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("users.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("users.subtitle")}</p>
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
                    <TableHead>{t("users.username")}</TableHead>
                    <TableHead>{t("users.role")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("common.created")}</TableHead>
                    <TableHead className="w-32">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("users.not_found")}</TableCell></TableRow>
                  ) : (
                    filtered.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{u.contact_person || "–"}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
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
    </div>
  );
};

export default SuperAdminUsers;
