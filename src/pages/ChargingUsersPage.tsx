import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import ChargingUsersTab from "@/components/charging/ChargingUsersTab";

const ChargingUsersPage = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("nav.chargingUsers" as any)}</h1>
            <p className="text-muted-foreground">{t("cu.pageDesc" as any)}</p>
          </div>
          <ChargingUsersTab />
        </div>
      </main>
    </div>
  );
};

export default ChargingUsersPage;
