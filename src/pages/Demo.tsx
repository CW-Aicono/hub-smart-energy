import { useState, useMemo } from "react";
import { useDashboardWidgets, WidgetSize } from "@/hooks/useDashboardWidgets";
import { useTranslation } from "@/hooks/useTranslation";
import { useModuleGuard } from "@/hooks/useModuleGuard";
import { DashboardFilterProvider, useDashboardFilter } from "@/hooks/useDashboardFilter";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { LocationFilter } from "@/components/dashboard/LocationFilter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ZoomIn } from "lucide-react";
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
import WeatherNormalizationWidget from "@/components/dashboard/WeatherNormalizationWidget";
import EnergyGaugeWidget from "@/components/dashboard/EnergyGaugeWidget";
import SpotPriceWidget from "@/components/dashboard/SpotPriceWidget";
import PvForecastWidget from "@/components/dashboard/PvForecastWidget";
import ArbitrageAiWidget from "@/components/dashboard/ArbitrageAiWidget";

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        {/* Demo Banner */}
        <div className="bg-primary text-primary-foreground px-4 py-2.5 text-center text-sm font-medium">
          🔍 Demo-Modus – Entdecken Sie alle Funktionen unserer Energiemanagement-Plattform
        </div>

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
                    <Component locationId={selectedLocationId} />
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
              return <ExpandedComponent locationId={selectedLocationId} onCollapse={() => setExpandedWidget(null)} />;
            })()}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

const Demo = () => (
  <DashboardFilterProvider>
    <DemoContent />
  </DashboardFilterProvider>
);

export default Demo;
