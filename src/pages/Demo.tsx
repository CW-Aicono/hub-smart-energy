import { useState, useMemo, lazy, Suspense } from "react";
import { useDashboardWidgets } from "@/hooks/useDashboardWidgets";
import { useTranslation } from "@/hooks/useTranslation";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import { DashboardFilterProvider, useDashboardFilter } from "@/hooks/useDashboardFilter";
import { DemoLayout } from "@/components/layout/DemoLayout";
import { LocationFilter } from "@/components/dashboard/LocationFilter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ZoomIn } from "lucide-react";

// Lazy-load all widget components
const EnergyChart = lazy(() => import("@/components/dashboard/EnergyChart"));
const CostOverview = lazy(() => import("@/components/dashboard/CostOverview"));
const SustainabilityKPIs = lazy(() => import("@/components/dashboard/SustainabilityKPIs"));
const AlertsList = lazy(() => import("@/components/dashboard/AlertsList"));
const LocationMapWidget = lazy(() => import("@/components/dashboard/LocationMapWidget"));
const FloorPlanWidget = lazy(() => import("@/components/dashboard/FloorPlanWidget"));
const FloorPlanDashboardWidget = lazy(() => import("@/components/dashboard/FloorPlanDashboardWidget"));
const WeatherWidget = lazy(() => import("@/components/dashboard/WeatherWidget"));
const PieChartWidget = lazy(() => import("@/components/dashboard/PieChartWidget"));
const SankeyWidget = lazy(() => import("@/components/dashboard/SankeyWidget"));
const ForecastWidget = lazy(() => import("@/components/dashboard/ForecastWidget"));
const AnomalyWidget = lazy(() => import("@/components/dashboard/AnomalyWidget"));
const WeatherNormalizationWidget = lazy(() => import("@/components/dashboard/WeatherNormalizationWidget"));
const EnergyGaugeWidget = lazy(() => import("@/components/dashboard/EnergyGaugeWidget"));
const SpotPriceWidget = lazy(() => import("@/components/dashboard/SpotPriceWidget"));
const PvForecastWidget = lazy(() => import("@/components/dashboard/PvForecastWidget"));
const ArbitrageAiWidget = lazy(() => import("@/components/dashboard/ArbitrageAiWidget"));

interface WidgetProps {
  locationId: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
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
  weather_normalization: WeatherNormalizationWidget,
  energy_gauge: EnergyGaugeWidget,
  spot_price: SpotPriceWidget,
  pv_forecast: PvForecastWidget,
  arbitrage_ai: ArbitrageAiWidget,
};

const WIDGET_MODULE_MAP: Record<string, string> = {
  floor_plan_explorer: "floor_plans",
  floor_plan: "floor_plans",
  alerts_list: "alerts",
  forecast: "energy_monitoring",
  anomaly: "energy_monitoring",
  energy_chart: "energy_monitoring",
  cost_overview: "energy_monitoring",
  sustainability_kpis: "energy_monitoring",
  pie_chart: "energy_monitoring",
  sankey: "energy_monitoring",
  weather_normalization: "energy_monitoring",
  energy_gauge: "energy_monitoring",
  spot_price: "arbitrage_trading",
  pv_forecast: "energy_monitoring",
};

const DemoContent = () => {
  const { widgets, visibleWidgets, loading: widgetsLoading } = useDashboardWidgets();
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);
  const { t } = useTranslation();
  const { selectedLocationId, setSelectedLocationId } = useDashboardFilter();
  const { isModuleEnabled } = useModuleGuard();

  const filteredVisibleWidgets = useMemo(() => {
    return visibleWidgets.filter((w) => {
      const moduleCode = WIDGET_MODULE_MAP[w.widget_type];
      if (!moduleCode) return true;
      return isModuleEnabled(moduleCode);
    });
  }, [visibleWidgets, isModuleEnabled]);

  if (widgetsLoading) {
    return (
      <DemoLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
        </div>
      </DemoLayout>
    );
  }

  return (
    <DemoLayout>
      <header className="border-b p-4 md:p-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-bold">{t("dashboard.energyDashboard")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <LocationFilter
            selectedLocationId={selectedLocationId}
            onLocationChange={setSelectedLocationId}
          />
        </div>
      </header>
      <div className="p-3 md:p-6">
        <div className="flex flex-wrap gap-4">
          {filteredVisibleWidgets.length > 0 ? (
            filteredVisibleWidgets.map((widget) => {
              const widgetType = widget.widget_type;
              const Component = WIDGET_COMPONENTS[widgetType];
              return Component ? (
                <div
                  key={widget.widget_type}
                  className="w-full min-w-0 relative group"
                  data-widget-size={widget.widget_size}
                >
                  {widget.widget_size !== "full" && widgetType !== "floor_plan_explorer" && (
                    <button
                      onClick={() => setExpandedWidget(widgetType)}
                      className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-background/80 border border-border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                      title="Vergrößern"
                    >
                      <ZoomIn className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                  <Suspense fallback={<div className="h-[200px] animate-pulse bg-muted rounded-lg" />}>
                    <Component locationId={selectedLocationId} />
                  </Suspense>
                </div>
              ) : null;
            })
          ) : (
            <div className="text-center py-12 text-muted-foreground w-full">
              <p>{t("dashboard.noWidgets")}</p>
            </div>
          )}
        </div>
      </div>
      <Dialog open={!!expandedWidget} onOpenChange={() => setExpandedWidget(null)}>
        <DialogContent className="max-w-[90vw] w-full max-h-[90vh] overflow-auto p-6" hideCloseButton>
          {expandedWidget && WIDGET_COMPONENTS[expandedWidget] && (() => {
            const ExpandedComponent = WIDGET_COMPONENTS[expandedWidget];
            return (
              <Suspense fallback={<div className="flex items-center justify-center p-12"><div className="animate-pulse text-muted-foreground">Laden…</div></div>}>
                <ExpandedComponent locationId={selectedLocationId} onCollapse={() => setExpandedWidget(null)} />
              </Suspense>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DemoLayout>
  );
};

const Demo = () => (
  <DashboardFilterProvider>
    <DemoContent />
  </DashboardFilterProvider>
);

export default Demo;
