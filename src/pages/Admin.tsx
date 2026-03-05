import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import UserManagement from "@/components/admin/UserManagement";
import InviteUserDialog from "@/components/admin/InviteUserDialog";
import ExternalContactsManager from "@/components/admin/ExternalContactsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, BookUser } from "lucide-react";

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { t } = useTranslation();
  const [tab, setTab] = useState("users");

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
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">{t("users.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("users.subtitle")}
            </p>
          </div>
          {tab === "users" && <InviteUserDialog />}
        </header>
        <div className="p-3 md:p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="users" className="gap-1.5">
                <Users className="h-4 w-4" /> Benutzerverwaltung
              </TabsTrigger>
              <TabsTrigger value="external" className="gap-1.5">
                <BookUser className="h-4 w-4" /> Externe Dienstleister
              </TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
            <TabsContent value="external">
              <ExternalContactsManager />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Admin;
