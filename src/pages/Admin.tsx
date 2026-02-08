import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import UserManagement from "@/components/admin/UserManagement";
import InviteUserDialog from "@/components/admin/InviteUserDialog";

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Laden...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Admin-Bereich</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Nutzer, Rollen und Einladungen verwalten
            </p>
          </div>
          <InviteUserDialog />
        </header>
        <div className="p-6">
          <UserManagement />
        </div>
      </main>
    </div>
  );
};

export default Admin;
