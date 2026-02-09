import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, MapPin, BarChart3 } from "lucide-react";

const SuperAdminDashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { tenantCount, userCount, locationCount } = usePlatformStats();

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Laden...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const kpis = [
    { label: "Mandanten", value: tenantCount, icon: Building2 },
    { label: "Benutzer", value: userCount, icon: Users },
    { label: "Standorte", value: locationCount, icon: MapPin },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">Super-Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Plattform-Übersicht</p>
        </header>
        <div className="p-6 grid gap-6 md:grid-cols-3">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{kpi.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
