import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardWidgets } from "@/hooks/useDashboardWidgets";
import { useTranslation } from "@/hooks/useTranslation";
import { DashboardFilterProvider, useDashboardFilter } from "@/hooks/useDashboardFilter";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardCustomizer from "@/components/dashboard/DashboardCustomizer";
import { LocationFilter } from "@/components/dashboard/LocationFilter";
import EnergyChart from "@/components/dashboard/EnergyChart";
import CostOverview from "@/components/dashboard/CostOverview";
import SustainabilityKPIs from "@/components/dashboard/SustainabilityKPIs";
import AlertsList from "@/components/dashboard/AlertsList";
import LocationMapWidget from "@/components/dashboard/LocationMapWidget";
import FloorPlanWidget from "@/components/dashboard/FloorPlanWidget";
import FloorPlanDashboardWidget from "@/components/dashboard/FloorPlanDashboardWidget";
import WeatherWidget from "@/components/dashboard/WeatherWidget";
import PieChartWidget from "@/components/dashboard/PieChartWidget";
import SankeyWidget from "@/components/dashboard/SankeyWidget";

interface WidgetProps {
  locationId: string | null;
}

const WIDGET_COMPONENTS: Record<string, React.ComponentType<WidgetProps>> = {
  cost_overview: CostOverview,
  energy_chart: EnergyChart,
  sustainability_kpis: SustainabilityKPIs,
  alerts_list: AlertsList,
  location_map: LocationMapWidget,
  floor_plan: FloorPlanWidget,
  weather: WeatherWidget,
  floor_plan_explorer: FloorPlanDashboardWidget,
  pie_chart: PieChartWidget,
  sankey: SankeyWidget,
};

const getLocationWidget = (locationId: string | null): string => {
  return locationId ? "floor_plan" : "location_map";
};

const DashboardContent = () => {
  const { widgets, visibleWidgets, loading: widgetsLoading, toggleWidgetVisibility, reorderWidgets } = useDashboardWidgets();
  const { t } = useTranslation();
  const { selectedLocationId, setSelectedLocationId } = useDashboardFilter();

  if (widgetsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-display font-bold">{t("dashboard.energyDashboard")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <LocationFilter
              selectedLocationId={selectedLocationId}
              onLocationChange={setSelectedLocationId}
            />
            <DashboardCustomizer
              widgets={widgets}
              onToggleVisibility={toggleWidgetVisibility}
              onReorder={reorderWidgets}
              onResetLayout={() => {
                const defaultOrder = widgets
                  .sort((a, b) => a.position - b.position)
                  .map(w => w.widget_type);
                reorderWidgets(defaultOrder);
              }}
            />
          </div>
        </header>
        <div className="p-6 flex flex-col gap-2">
          {visibleWidgets.length > 0 ? (
            visibleWidgets.map((widget) => {
              const widgetType = widget.widget_type === "location_map"
                ? getLocationWidget(selectedLocationId)
                : widget.widget_type;
              const Component = WIDGET_COMPONENTS[widgetType];
              return Component ? (
                <div key={widget.widget_type}>
                  <Component locationId={selectedLocationId} />
                </div>
              ) : null;
            })
          ) : (
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

const Index = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <DashboardFilterProvider>
      <DashboardContent />
    </DashboardFilterProvider>
  );
};

export default Index;
