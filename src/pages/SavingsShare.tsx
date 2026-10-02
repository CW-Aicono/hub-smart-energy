import { Navigate } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import SavingsShareReadOnly from "@/components/savings-share/SavingsShareReadOnly";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { Skeleton } from "@/components/ui/skeleton";
import { Euro } from "lucide-react";

export default function SavingsShare() {
  const { user, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  if (authLoading || tenantLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6"><Skeleton className="h-8 w-64 mb-6" /><Skeleton className="h-96" /></main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Euro className="h-6 w-6" />Gain-Sharing</h1>
          <p className="text-sm text-muted-foreground">Nachvollziehbare Baseline und Einsparbeteiligung.</p>
        </div>
        {tenant?.id && <SavingsShareReadOnly tenantId={tenant.id} />}
      </main>
    </div>
  );
}