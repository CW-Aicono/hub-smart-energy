import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import EnergyChart from "@/components/dashboard/EnergyChart";
import CostOverview from "@/components/dashboard/CostOverview";
import SustainabilityKPIs from "@/components/dashboard/SustainabilityKPIs";
import AlertsList from "@/components/dashboard/AlertsList";

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Laden...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-display font-bold">Energie-Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Übersicht Ihrer Energiedaten und Kennzahlen</p>
        </header>
        <div className="p-6 space-y-6">
          <CostOverview />
          <div className="grid gap-6 lg:grid-cols-2">
            <EnergyChart />
            <SustainabilityKPIs />
          </div>
          <AlertsList />
        </div>
      </main>
    </div>
  );
};

export default Index;
