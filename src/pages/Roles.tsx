import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useCustomRoles } from "@/hooks/useCustomRoles";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { CreateRoleDialog } from "@/components/roles/CreateRoleDialog";
import { RoleCard } from "@/components/roles/RoleCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock } from "lucide-react";

const Roles = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { 
    roles, 
    permissions: allPermissions, 
    permissionsByCategory: allPermissionsByCategory, 
    rolePermissions, 
    loading: rolesLoading,
    createRole,
    deleteRole,
    togglePermission,
  } = useCustomRoles();
  const { t } = useTranslation();

  // Filter out super_admin permissions (not needed in tenant context)
  const permissions = allPermissions.filter(p => !p.code.startsWith("sa_") && p.category !== "super_admin");
  const permissionsByCategory = Object.fromEntries(
    Object.entries(allPermissionsByCategory)
      .filter(([cat]) => cat !== "super_admin")
      .map(([cat, perms]) => [cat, perms.filter(p => !p.code.startsWith("sa_"))])
      .filter(([, perms]) => (perms as any[]).length > 0)
  );

  if (authLoading || roleLoading || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  // Create a virtual "Admin" role that always has all permissions
  const adminVirtualRole = {
    id: "admin-system",
    tenant_id: "",
    name: "Administrator",
    description: t("roles.adminFullAccess" as any),
    is_system_role: true,
    created_at: "",
    updated_at: "",
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">{t("roles.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("roles.subtitle")}
            </p>
          </div>
          <CreateRoleDialog onCreateRole={createRole} />
        </header>
        <div className="p-6 space-y-6">
          {/* Admin Role - Always shown first, not editable */}
          <RoleCard
            role={adminVirtualRole}
            permissions={permissions}
            permissionsByCategory={permissionsByCategory}
            rolePermissions={permissions.map(p => p.id)} // All permissions
            onTogglePermission={async () => ({ error: null })}
            onDeleteRole={async () => ({ error: new Error("Cannot delete admin role") })}
            isAdmin={true}
          />

          {/* Custom Roles */}
          {roles.length > 0 ? (
            roles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                permissions={permissions}
                permissionsByCategory={permissionsByCategory}
                rolePermissions={rolePermissions[role.id] || []}
                onTogglePermission={togglePermission}
                onDeleteRole={deleteRole}
              />
            ))
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t("roles.noCustomRoles" as any)}
                </CardTitle>
                <CardDescription>
                  {t("roles.noCustomRolesDesc" as any)}
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                {t("roles.noteTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                {t("roles.noteTextFull" as any)}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Roles;
