import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Users, Eye, Edit, Trash2 } from "lucide-react";
import { TranslationKey } from "@/i18n/translations";

const Roles = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { t } = useTranslation();

  const ROLE_PERMISSIONS = {
    admin: {
      labelKey: "roles.admin" as TranslationKey,
      descriptionKey: "roles.adminDescription" as TranslationKey,
      color: "bg-destructive/10 text-destructive border-destructive/20",
      permissions: [
        { nameKey: "roles.viewDashboard" as TranslationKey, icon: Eye },
        { nameKey: "roles.manageLocations" as TranslationKey, icon: Edit },
        { nameKey: "roles.inviteUsers" as TranslationKey, icon: Users },
        { nameKey: "roles.assignRoles" as TranslationKey, icon: Shield },
        { nameKey: "roles.customizeBranding" as TranslationKey, icon: Edit },
        { nameKey: "roles.createReports" as TranslationKey, icon: Eye },
        { nameKey: "roles.deleteData" as TranslationKey, icon: Trash2 },
      ],
    },
    user: {
      labelKey: "roles.user" as TranslationKey,
      descriptionKey: "roles.userDescription" as TranslationKey,
      color: "bg-primary/10 text-primary border-primary/20",
      permissions: [
        { nameKey: "roles.viewDashboard" as TranslationKey, icon: Eye },
        { nameKey: "roles.viewLocations" as TranslationKey, icon: Eye },
        { nameKey: "roles.viewReports" as TranslationKey, icon: Eye },
      ],
    },
  };

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-display font-bold">{t("roles.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("roles.subtitle")}
          </p>
        </header>
        <div className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {Object.entries(ROLE_PERMISSIONS).map(([key, role]) => (
              <Card key={key}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      {t(role.labelKey)}
                    </CardTitle>
                    <Badge variant="outline" className={role.color}>
                      {key}
                    </Badge>
                  </div>
                  <CardDescription>{t(role.descriptionKey)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground mb-3">
                      {t("roles.permissions")}:
                    </p>
                    <ul className="space-y-2">
                      {role.permissions.map((permission, idx) => (
                        <li
                          key={idx}
                          className="flex items-center gap-2 text-sm text-foreground/80"
                        >
                          <permission.icon className="h-4 w-4 text-muted-foreground" />
                          {t(permission.nameKey)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("roles.noteTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>{t("roles.noteText")}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Roles;
