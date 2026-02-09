import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardWidgets, WidgetSize } from "@/hooks/useDashboardWidgets";
import { useTranslation } from "@/hooks/useTranslation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ZoomIn, ZoomOut } from "lucide-react";
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
import ForecastWidget from "@/components/dashboard/ForecastWidget";
import AnomalyWidget from "@/components/dashboard/AnomalyWidget";

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
  forecast: ForecastWidget,
  anomaly: AnomalyWidget,
};

const SIZE_CLASS: Record<WidgetSize, string> = {
  "full": "w-full",
  "2/3": "w-2/3",
  "1/3": "w-1/3",
};

const getLocationWidget = (locationId: string | null): string => {
  return locationId ? "floor_plan" : "location_map";
};

const DashboardContent = () => {
  const { widgets, visibleWidgets, loading: widgetsLoading, toggleWidgetVisibility, reorderWidgets, updateWidgetSize } = useDashboardWidgets();
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);
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
              onResizeWidget={updateWidgetSize}
              onResetLayout={() => {
                // Reset all to full width and keep current order
                widgets.forEach(w => {
                  if (w.widget_size !== "full") {
                    updateWidgetSize(w.widget_type, "full");
                  }
                });
              }}
            />
          </div>
        </header>
        <div className="p-6">
          <div className="flex flex-wrap gap-4">
            {visibleWidgets.length > 0 ? (
              visibleWidgets.map((widget) => {
                const widgetType = widget.widget_type === "location_map"
                  ? getLocationWidget(selectedLocationId)
                  : widget.widget_type;
                const Component = WIDGET_COMPONENTS[widgetType];
                const sizeClass = SIZE_CLASS[widget.widget_size] || "w-full";
                return Component ? (
                  <div
                    key={widget.widget_type}
                    className={`${sizeClass} min-w-0 relative group`}
                    style={{ flexBasis: sizeClass === "w-full" ? "100%" : sizeClass === "w-2/3" ? "calc(66.666% - 8px)" : "calc(33.333% - 11px)" }}
                  >
                    {widget.widget_size !== "full" && (
                      <button
                        onClick={() => setExpandedWidget(widgetType)}
                        className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-background/80 border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                        title="Vergrößern"
                      >
                        <ZoomIn className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                    <Component locationId={selectedLocationId} />
                  </div>
                ) : null;
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground w-full">
                <p>{t("dashboard.noWidgets")}</p>
                <p className="text-sm mt-1">{t("dashboard.noWidgetsHint")}</p>
              </div>
            )}
          </div>
        </div>
      {/* Expanded widget dialog */}
      <Dialog open={!!expandedWidget} onOpenChange={() => setExpandedWidget(null)}>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh] overflow-auto p-6">
          <button
            onClick={() => setExpandedWidget(null)}
            className="absolute top-4 right-12 p-1.5 rounded-md bg-background/80 border border-border shadow-sm hover:bg-muted"
            title="Verkleinern"
          >
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
          </button>
          {expandedWidget && WIDGET_COMPONENTS[expandedWidget] && (() => {
            const ExpandedComponent = WIDGET_COMPONENTS[expandedWidget];
            return <ExpandedComponent locationId={selectedLocationId} />;
          })()}
        </DialogContent>
      </Dialog>
      </main>
    </div>
  );
};

const Index = () => {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (!user || onboardingChecked) return;
    const checkOnboarding = async () => {
      const { data } = await (await import("@/integrations/supabase/client")).supabase
        .from("user_preferences")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      setOnboardingChecked(true);
      if (data && !(data as any).onboarding_completed) {
        navigate("/getting-started", { replace: true });
      }
    };
    checkOnboarding();
  }, [user, onboardingChecked, navigate]);

  if (loading || !onboardingChecked) {
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
