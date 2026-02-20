import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type WidgetSize = "full" | "2/3" | "1/2" | "1/3";

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  widget_type: string;
  position: number;
  is_visible: boolean;
  widget_size: WidgetSize;
  config: Record<string, unknown>;
  layout?: WidgetLayout;
}

const DEFAULT_WIDGETS = [
  { widget_type: "location_map", position: 0, is_visible: true },
  { widget_type: "weather", position: 1, is_visible: true },
  { widget_type: "energy_gauge", position: 2, is_visible: true },
  { widget_type: "cost_overview", position: 3, is_visible: true },
  { widget_type: "energy_chart", position: 4, is_visible: true },
  { widget_type: "sustainability_kpis", position: 5, is_visible: true },
  { widget_type: "alerts_list", position: 6, is_visible: true },
  { widget_type: "floor_plan_explorer", position: 7, is_visible: true },
  { widget_type: "pie_chart", position: 8, is_visible: true },
  { widget_type: "sankey", position: 9, is_visible: true },
  { widget_type: "forecast", position: 10, is_visible: true },
  { widget_type: "anomaly", position: 11, is_visible: true },
  { widget_type: "weather_normalization", position: 12, is_visible: true },
  { widget_type: "spot_price", position: 13, is_visible: true },
];

export function useDashboardWidgets() {
  const { user } = useAuth();
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWidgets = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("dashboard_widgets")
      .select("*")
      .eq("user_id", user.id)
      .order("position", { ascending: true });

    if (error) {
      console.error("Error fetching widgets:", error);
      setWidgets([]);
    } else if (data && data.length > 0) {
      // Check for missing default widgets and add them for existing users
      const existingTypes = new Set(data.map(w => w.widget_type));
      const missingWidgets = DEFAULT_WIDGETS.filter(dw => !existingTypes.has(dw.widget_type));
      
      if (missingWidgets.length > 0) {
        const maxPosition = Math.max(...data.map(w => w.position), 0);
        const widgetsToInsert = missingWidgets.map((w, idx) => ({
          user_id: user.id,
          widget_type: w.widget_type,
          position: maxPosition + idx + 1,
          is_visible: w.is_visible,
          config: {},
        }));
        
        const { data: newWidgets } = await supabase
          .from("dashboard_widgets")
          .insert(widgetsToInsert)
          .select();
        
        if (newWidgets) {
          setWidgets([...data, ...newWidgets] as DashboardWidget[]);
        } else {
          setWidgets(data as DashboardWidget[]);
        }
      } else {
        setWidgets(data as DashboardWidget[]);
      }
    } else {
      // Initialize default widgets for new users
      await initializeDefaultWidgets();
    }
    setLoading(false);
  }, [user]);

  const initializeDefaultWidgets = async () => {
    if (!user) return;

    const widgetsToInsert = DEFAULT_WIDGETS.map((w) => ({
      user_id: user.id,
      widget_type: w.widget_type,
      position: w.position,
      is_visible: w.is_visible,
      config: {},
    }));

    const { data, error } = await supabase
      .from("dashboard_widgets")
      .insert(widgetsToInsert)
      .select();

    if (error) {
      console.error("Error initializing widgets:", error);
    } else {
      setWidgets(data as DashboardWidget[]);
    }
  };

  const toggleWidgetVisibility = async (widgetType: string) => {
    const widget = widgets.find((w) => w.widget_type === widgetType);
    if (!widget) return;

    const { error } = await supabase
      .from("dashboard_widgets")
      .update({ is_visible: !widget.is_visible })
      .eq("id", widget.id);

    if (!error) {
      setWidgets((prev) =>
        prev.map((w) =>
          w.widget_type === widgetType ? { ...w, is_visible: !w.is_visible } : w
        )
      );
    }
  };

  const reorderWidgets = async (newOrder: string[]) => {
    const updates = newOrder.map((widgetType, index) => {
      const widget = widgets.find((w) => w.widget_type === widgetType);
      return widget ? { id: widget.id, position: index } : null;
    }).filter(Boolean);

    // Update local state optimistically
    setWidgets((prev) => {
      const reordered = [...prev];
      newOrder.forEach((widgetType, index) => {
        const widget = reordered.find((w) => w.widget_type === widgetType);
        if (widget) widget.position = index;
      });
      return reordered.sort((a, b) => a.position - b.position);
    });

    // Update in database
    for (const update of updates) {
      if (update) {
        await supabase
          .from("dashboard_widgets")
          .update({ position: update.position })
          .eq("id", update.id);
      }
    }
  };

  const updateWidgetSize = async (widgetType: string, size: WidgetSize) => {
    const widget = widgets.find((w) => w.widget_type === widgetType);
    if (!widget) return;

    const { error } = await supabase
      .from("dashboard_widgets")
      .update({ widget_size: size })
      .eq("id", widget.id);

    if (!error) {
      setWidgets((prev) =>
        prev.map((w) =>
          w.widget_type === widgetType ? { ...w, widget_size: size } : w
        )
      );
    }
  };

  const updateWidgetLayout = async (widgetType: string, layout: WidgetLayout) => {
    const widget = widgets.find((w) => w.widget_type === widgetType);
    if (!widget) return;

    const newConfig = { ...(widget.config || {}), layout };

    const { error } = await supabase
      .from("dashboard_widgets")
      .update({ config: newConfig as any })
      .eq("id", widget.id);

    if (!error) {
      setWidgets((prev) =>
        prev.map((w) =>
          w.widget_type === widgetType ? { ...w, config: newConfig, layout } : w
        )
      );
    }
  };

  const updateAllLayouts = async (layouts: Record<string, WidgetLayout>) => {
    const updates = Object.entries(layouts).map(async ([widgetType, layout]) => {
      const widget = widgets.find((w) => w.widget_type === widgetType);
      if (!widget) return;
      const newConfig = { ...(widget.config || {}), layout };
      await supabase
        .from("dashboard_widgets")
        .update({ config: newConfig as any })
        .eq("id", widget.id);
    });
    await Promise.all(updates);

    setWidgets((prev) =>
      prev.map((w) => {
        const layout = layouts[w.widget_type];
        if (layout) {
          const newConfig = { ...(w.config || {}), layout };
          return { ...w, config: newConfig, layout };
        }
        return w;
      })
    );
  };

  const resetLayouts = async (defaultLayouts: Record<string, WidgetLayout>) => {
    const updates = Object.entries(defaultLayouts).map(async ([widgetType, layout]) => {
      const widget = widgets.find((w) => w.widget_type === widgetType);
      if (!widget) return;
      const newConfig = { ...(widget.config || {}), layout };
      await supabase
        .from("dashboard_widgets")
        .update({ config: newConfig as any })
        .eq("id", widget.id);
    });
    await Promise.all(updates);

    setWidgets((prev) =>
      prev.map((w) => {
        const layout = defaultLayouts[w.widget_type];
        if (layout) {
          const newConfig = { ...(w.config || {}), layout };
          return { ...w, config: newConfig, layout };
        }
        return w;
      })
    );
  };

  useEffect(() => {
    fetchWidgets();
  }, [fetchWidgets]);

  // Parse layout from config
  const widgetsWithLayout = widgets.map((w) => ({
    ...w,
    layout: (w.config as any)?.layout as WidgetLayout | undefined,
  }));

  const visibleWidgets = widgetsWithLayout
    .filter((w) => w.is_visible)
    .sort((a, b) => a.position - b.position);

  return {
    widgets: widgetsWithLayout,
    visibleWidgets,
    loading,
    toggleWidgetVisibility,
    reorderWidgets,
    updateWidgetSize,
    updateWidgetLayout,
    updateAllLayouts,
    resetLayouts,
    refetch: fetchWidgets,
  };
}
