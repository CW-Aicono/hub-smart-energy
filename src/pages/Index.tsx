import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardWidgets } from "@/hooks/useDashboardWidgets";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardCustomizer from "@/components/dashboard/DashboardCustomizer";
import EnergyChart from "@/components/dashboard/EnergyChart";
import CostOverview from "@/components/dashboard/CostOverview";
import SustainabilityKPIs from "@/components/dashboard/SustainabilityKPIs";
import AlertsList from "@/components/dashboard/AlertsList";
import LocationMapWidget from "@/components/dashboard/LocationMapWidget";
import WeatherWidget from "@/components/dashboard/WeatherWidget";

const WIDGET_COMPONENTS: Record<string, React.ComponentType> = {
  cost_overview: CostOverview,
  energy_chart: EnergyChart,
  sustainability_kpis: SustainabilityKPIs,
  alerts_list: AlertsList,
  location_map: LocationMapWidget,
  weather: WeatherWidget,
};

const Index = () => {
  const { user, loading } = useAuth();
  const { widgets, visibleWidgets, loading: widgetsLoading, toggleWidgetVisibility, reorderWidgets } = useDashboardWidgets();
  const { t } = useTranslation();

  if (loading || widgetsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">{t("dashboard.energyDashboard")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
          </div>
          <DashboardCustomizer 
            widgets={widgets} 
            onToggleVisibility={toggleWidgetVisibility}
            onReorder={reorderWidgets}
          />
        </header>
        <div className="p-6 space-y-6">
          {visibleWidgets.map((widget) => {
            const Component = WIDGET_COMPONENTS[widget.widget_type];
            return Component ? <Component key={widget.widget_type} /> : null;
          })}
          {visibleWidgets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("dashboard.noWidgets")}</p>
              <p className="text-sm mt-1">{t("dashboard.noWidgetsHint")}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
