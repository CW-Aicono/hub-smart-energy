import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenant } from "./useTenant";
import { useDemoMode } from "@/contexts/DemoMode";
import type { Database, Json } from "@/integrations/supabase/types";

export type WidgetSize = "full" | "2/3" | "1/2" | "1/3";

export interface WidgetLayout {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Custom widget height in pixels (drag-resized by the user). */
  height?: number;
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
  { widget_type: "pv_forecast", position: 14, is_visible: true },
  { widget_type: "arbitrage_ai", position: 15, is_visible: true },
  { widget_type: "integration_errors", position: 16, is_visible: true },
  { widget_type: "savings_share", position: 17, is_visible: true },
];

export function useDashboardWidgets() {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const isDemo = useDemoMode();
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWidgets = useCallback(async () => {
    if (isDemo) {
      const demoWidgets: DashboardWidget[] = DEFAULT_WIDGETS.map((w) => ({
        id: `demo-${w.widget_type}`,
        widget_type: w.widget_type,
        position: w.position,
        is_visible: w.is_visible,
        widget_size: "full" as WidgetSize,
        config: {},
      }));
      setWidgets(demoWidgets);
      setLoading(false);
      return;
    }

    if (!user) return;

    setLoading(true);

    // Fetch tenant's custom widget definitions so we can auto-provision
    // dashboard_widgets rows for users who don't yet have them (e.g. remote
    // support users impersonating a tenant, freshly-invited team members).
    let customDefs: { id: string }[] = [];
    if (tenant?.id) {
      const { data: defs } = await supabase
        .from("custom_widget_definitions")
        .select("id")
        .eq("tenant_id", tenant.id);
      customDefs = defs ?? [];
    }

    const { data, error } = await supabase
      .from("dashboard_widgets")
      .select("*")
      .eq("user_id", user.id)
      .order("position", { ascending: true });

    if (error) {
      console.error("Error fetching widgets:", error);
      setWidgets([]);
    } else if (data && data.length > 0) {
      const existingTypes = new Set(data.map(w => w.widget_type));
      const missingDefaults = DEFAULT_WIDGETS.filter(dw => !existingTypes.has(dw.widget_type));
      const missingCustom = customDefs.filter(d => !existingTypes.has(`custom_${d.id}`));

      if (missingDefaults.length > 0 || missingCustom.length > 0) {
        const maxPosition = Math.max(...data.map(w => w.position), 0);
        const defaultInserts = missingDefaults.map((w, idx) => ({
          user_id: user.id,
          widget_type: w.widget_type,
          position: maxPosition + idx + 1,
          is_visible: w.is_visible,
          widget_size: "full",
          config: {} as Json,
        }));

        const customInserts = missingCustom.map((d, idx) => ({
          user_id: user.id,
          widget_type: `custom_${d.id}`,
          position: maxPosition + missingDefaults.length + idx + 1,
          is_visible: true,
          widget_size: "full",
          config: {} as Json,
        }));

        const { data: newWidgets } = await supabase
          .from("dashboard_widgets")
          .insert([...defaultInserts, ...customInserts])
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
      await initializeDefaultWidgets(customDefs);
    }
    setLoading(false);
  }, [user, isDemo, tenant?.id]);

  const initializeDefaultWidgets = async (customDefs: { id: string }[] = []) => {
    if (!user) return;

    const widgetsToInsert = [
      ...DEFAULT_WIDGETS.map((w) => ({
        user_id: user.id,
        widget_type: w.widget_type,
        position: w.position,
        is_visible: w.is_visible,
        widget_size: "full",
        config: {} as Json,
      })),
      ...customDefs.map((d, idx) => ({
        user_id: user.id,
        widget_type: `custom_${d.id}`,
        position: DEFAULT_WIDGETS.length + idx,
        is_visible: true,
        widget_size: "full",
        config: {} as Json,
      })),
    ];


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

    setWidgets((prev) => {
      const reordered = [...prev];
      newOrder.forEach((widgetType, index) => {
        const widget = reordered.find((w) => w.widget_type === widgetType);
        if (widget) widget.position = index;
      });
      return reordered.sort((a, b) => a.position - b.position);
    });

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
      .update({ config: newConfig as unknown as Json })
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
        .update({ config: newConfig as unknown as Json })
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
        .update({ config: newConfig as unknown as Json })
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

  // Parse layout from config using typed access
  const widgetsWithLayout = widgets.map((w) => ({
    ...w,
    layout: (w.config as Record<string, unknown>)?.layout as WidgetLayout | undefined,
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
