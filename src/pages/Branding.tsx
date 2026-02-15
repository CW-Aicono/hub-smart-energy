import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { WeekStartSetting } from "@/components/settings/WeekStartSetting";
import { Skeleton } from "@/components/ui/skeleton";
import { Palette } from "lucide-react";

const Branding = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { t } = useTranslation();

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64" />
        </main>
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
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Palette className="h-6 w-6" />
            {t("nav.branding")}
          </h1>
          <p className="text-muted-foreground mt-1">
            Passen Sie das Erscheinungsbild und die Grundeinstellungen Ihrer Plattform an
          </p>
        </header>

        <div className="p-6 space-y-6">
          <WeekStartSetting />
          <BrandingSettings />
        </div>
      </main>
    </div>
  );
};

export default Branding;
