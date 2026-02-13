import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, Crown, Users, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CreateSAPermissionRoleDialog from "@/components/super-admin/CreateSAPermissionRoleDialog";
import EditSARoleDialog from "@/components/super-admin/EditSARoleDialog";

const SuperAdminRoles = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();

  const SA_CAPABILITIES = [
    { name: t("cap.tenant_mgmt"), description: t("cap.tenant_mgmt_desc") },
    { name: t("cap.license_mgmt"), description: t("cap.license_mgmt_desc") },
    { name: t("cap.platform_stats"), description: t("cap.platform_stats_desc") },
    { name: t("cap.billing_mgmt"), description: t("cap.billing_mgmt_desc") },
    { name: t("cap.support_access"), description: t("cap.support_access_desc") },
    { name: t("cap.user_mgmt"), description: t("cap.user_mgmt_desc") },
    { name: t("cap.map_view"), description: t("cap.map_view_desc") },
    { name: t("cap.module_mgmt"), description: t("cap.module_mgmt_desc") },
  ];

  const { data: superAdmins = [], isLoading: adminsLoading } = useQuery({
    queryKey: ["sa-super-admins"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, created_at").eq("role", "super_admin");
      if (error) throw error;
      if (!data || data.length === 0) return [];
      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, email, contact_person").in("user_id", userIds);
      return data.map((r) => {
        const profile = profiles?.find((p) => p.user_id === r.user_id);
        return { user_id: r.user_id, email: profile?.email ?? "–", name: profile?.contact_person ?? "–", since: r.created_at };
      });
    },
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ["sa-custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_roles").select("*, custom_role_permissions(permission_id, permissions(name))").eq("is_system_role", true).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
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
            <h1 className="text-2xl font-bold">{t("roles.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("roles.subtitle")}</p>
          </div>
          <CreateSAPermissionRoleDialog />
        </header>
        <div className="p-6 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5" style={{ color: `hsl(var(--sa-primary))` }} />
                <CardTitle>{t("roles.sa_role")}</CardTitle>
              </div>
              <CardDescription>{t("roles.sa_role_desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />{t("roles.permissions")}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {SA_CAPABILITIES.map((cap) => (
                  <div key={cap.name} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: `hsl(var(--sa-primary))` }} />
                    <div>
                      <p className="text-sm font-medium">{cap.name}</p>
                      <p className="text-xs text-muted-foreground">{cap.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t("roles.super_admins")} ({adminsLoading ? "…" : superAdmins.length})
              </CardTitle>
              <CardDescription>{t("roles.sa_users_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("common.email")}</TableHead>
                    <TableHead>{t("users.role")}</TableHead>
                    <TableHead>{t("roles.since")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminsLoading ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("common.loading")}</TableCell></TableRow>
                  ) : superAdmins.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("roles.no_sa_found")}</TableCell></TableRow>
                  ) : (
                    superAdmins.map((sa) => (
                      <TableRow key={sa.user_id}>
                        <TableCell className="font-medium">{sa.name}</TableCell>
                        <TableCell className="text-muted-foreground">{sa.email}</TableCell>
                        <TableCell><Badge variant="destructive">{t("users.super_admin")}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm">{new Date(sa.since).toLocaleDateString("de-DE")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {customRoles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t("roles.custom_roles")} ({customRoles.length})
                </CardTitle>
                <CardDescription>{t("roles.custom_roles_desc")}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("users.role")}</TableHead>
                      <TableHead>{t("roles.description")}</TableHead>
                      <TableHead>{t("roles.permissions")}</TableHead>
                      <TableHead>{t("common.created")}</TableHead>
                      <TableHead className="w-16">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customRoles.map((role: any) => (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">{role.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{role.description || "–"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {role.custom_role_permissions?.map((crp: any) => (
                              <Badge key={crp.permission_id} variant="secondary" className="text-xs">{crp.permissions?.name ?? crp.permission_id}</Badge>
                            ))}
                            {(!role.custom_role_permissions || role.custom_role_permissions.length === 0) && <span className="text-xs text-muted-foreground">{t("common.none")}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{new Date(role.created_at).toLocaleDateString("de-DE")}</TableCell>
                        <TableCell><EditSARoleDialog role={role} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default SuperAdminRoles;
