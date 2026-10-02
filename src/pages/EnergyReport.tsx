import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import KommuneReport from "@/components/report/templates/KommuneReport";
import GewerbeIndustrieReport from "@/components/report/templates/GewerbeIndustrieReport";
import PrivatReport from "@/components/report/templates/PrivatReport";
import SonstigeReport from "@/components/report/templates/SonstigeReport";

/**
 * Dispatcher: selects the appropriate report template based on tenant_type.
 * The kommune template is unchanged (full Bundesland-aware report). The three
 * other templates render compact, type-specific reports with their own legal
 * framework selection and KI text sections.
 */
const EnergyReport = () => {
  const { user, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();

  if (authLoading || tenantLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-96" />
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  switch (tenant?.tenant_type) {
    case "gewerbe_industrie":
      return <GewerbeIndustrieReport />;
    case "privat":
      return <PrivatReport />;
    case "sonstige":
      return <SonstigeReport />;
    case "kommune":
    default:
      return <KommuneReport />;
  }
};

export default EnergyReport;
