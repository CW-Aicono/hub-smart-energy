import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardWidgets, WidgetLayout } from "@/hooks/useDashboardWidgets";
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
import { Responsive, WidthProvider, Layout } from "react-grid-layout";
import { useCallback, useRef, useState, useEffect } from "react";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

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

const DEFAULT_LAYOUTS: Record<string, WidgetLayout> = {
  location_map: { x: 0, y: 0, w: 2, h: 3 },
  weather: { x: 2, y: 0, w: 1, h: 3 },
  cost_overview: { x: 0, y: 3, w: 1, h: 3 },
  energy_chart: { x: 1, y: 3, w: 2, h: 3 },
  sustainability_kpis: { x: 0, y: 6, w: 2, h: 3 },
  alerts_list: { x: 2, y: 6, w: 1, h: 3 },
  floor_plan_explorer: { x: 0, y: 9, w: 2, h: 3 },
  pie_chart: { x: 2, y: 9, w: 1, h: 3 },
  sankey: { x: 0, y: 12, w: 3, h: 3 },
};

const getLocationWidget = (locationId: string | null): string => {
  return locationId ? "floor_plan" : "location_map";
};

const DashboardContent = () => {
  const { widgets, visibleWidgets, loading: widgetsLoading, toggleWidgetVisibility, reorderWidgets, updateWidgetSize, updateAllLayouts, resetLayouts } = useDashboardWidgets();
  const { t } = useTranslation();
  const { selectedLocationId, setSelectedLocationId } = useDashboardFilter();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const layouts = visibleWidgets.map((widget, idx): Layout => {
    const l = widget.layout || DEFAULT_LAYOUTS[widget.widget_type] || { x: (idx % 3), y: Math.floor(idx / 3) * 2, w: 1, h: 2 };
    return {
      i: widget.widget_type,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      minW: 1,
      minH: 1,
      maxW: 3,
      maxH: 4,
    };
  });

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const layoutMap: Record<string, WidgetLayout> = {};
      newLayout.forEach((item) => {
        layoutMap[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
      });
      updateAllLayouts(layoutMap);
    }, 800);
  }, [updateAllLayouts]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

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
              onResetLayout={() => resetLayouts(DEFAULT_LAYOUTS)}
            />
          </div>
        </header>
        <div className="p-6">
          {visibleWidgets.length > 0 ? (
            <ResponsiveGridLayout
              className="layout"
              layouts={{ lg: layouts, md: layouts, sm: layouts }}
              breakpoints={{ lg: 1200, md: 996, sm: 768 }}
              cols={{ lg: 3, md: 3, sm: 1 }}
              rowHeight={150}
              margin={[16, 16]}
              isDraggable={true}
              isResizable={true}
              onLayoutChange={(layout) => handleLayoutChange(layout)}
              draggableCancel=".no-drag"
            >
              {visibleWidgets.map((widget) => {
                const widgetType = widget.widget_type === "location_map"
                  ? getLocationWidget(selectedLocationId)
                  : widget.widget_type;
                const Component = WIDGET_COMPONENTS[widgetType];
                return Component ? (
                  <div key={widget.widget_type}>
                    <div className="h-full w-full overflow-auto">
                      <Component locationId={selectedLocationId} />
                    </div>
                  </div>
                ) : null;
              })}
            </ResponsiveGridLayout>
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
