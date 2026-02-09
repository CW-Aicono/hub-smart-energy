import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardWidgets, WidgetLayout, WidgetSize } from "@/hooks/useDashboardWidgets";
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

const SIZE_TO_WIDTH: Record<WidgetSize, number> = {
  small: 1,
  medium: 2,
  large: 2,
  full: 3,
};

const SIZE_TO_HEIGHT: Record<WidgetSize, number> = {
  small: 3,
  medium: 3,
  large: 4,
  full: 3,
};

const DEFAULT_SIZES: Record<string, WidgetSize> = {
  location_map: "medium",
  weather: "small",
  cost_overview: "small",
  energy_chart: "medium",
  sustainability_kpis: "medium",
  alerts_list: "small",
  floor_plan_explorer: "medium",
  pie_chart: "small",
  sankey: "full",
};

const getLocationWidget = (locationId: string | null): string => {
  return locationId ? "floor_plan" : "location_map";
};

const DashboardContent = () => {
  const { widgets, visibleWidgets, loading: widgetsLoading, toggleWidgetVisibility, reorderWidgets, updateWidgetSize, updateAllLayouts, resetLayouts } = useDashboardWidgets();
  const { t } = useTranslation();
  const { selectedLocationId, setSelectedLocationId } = useDashboardFilter();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute layouts from widget_size and position order
  const layouts = (() => {
    const result: Layout[] = [];
    let cursorX = 0;
    let cursorY = 0;
    const cols = 3;

    for (const widget of visibleWidgets) {
      const size = widget.widget_size || DEFAULT_SIZES[widget.widget_type] || "medium";
      const w = SIZE_TO_WIDTH[size] || 1;
      const h = SIZE_TO_HEIGHT[size] || 3;

      // If widget doesn't fit in current row, move to next row
      if (cursorX + w > cols) {
        cursorX = 0;
        cursorY += 1; // react-grid-layout compacts, so approximate y
      }

      result.push({
        i: widget.widget_type,
        x: cursorX,
        y: cursorY,
        w,
        h,
        minW: 1,
        minH: 1,
        maxW: 3,
        maxH: 4,
      });

      cursorX += w;
      if (cursorX >= cols) {
        cursorX = 0;
        cursorY += h;
      }
    }

    return result;
  })();

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
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
              onResetLayout={async () => {
                // Reset sizes to defaults
                for (const [type, size] of Object.entries(DEFAULT_SIZES)) {
                  await updateWidgetSize(type, size);
                }
              }}
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
              isDraggable={false}
              isResizable={false}
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
                    <div className="h-full w-full overflow-hidden">
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
