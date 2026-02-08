import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { BrandingSettings } from "@/components/settings/BrandingSettings";

const Settings = () => {
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
        <header className="border-b p-6">
          <h1 className="text-2xl font-display font-bold">Einstellungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anwendungseinstellungen und Branding verwalten
          </p>
        </header>
        <div className="p-6 space-y-6">
          <BrandingSettings />
        </div>
      </main>
    </div>
  );
};

export default Settings;
