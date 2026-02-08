import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface DashboardWidget {
  id: string;
  widget_type: string;
  position: number;
  is_visible: boolean;
  config: Record<string, unknown>;
}

const DEFAULT_WIDGETS = [
  { widget_type: "location_map", position: 0, is_visible: true },
  { widget_type: "weather", position: 1, is_visible: true },
  { widget_type: "cost_overview", position: 2, is_visible: true },
  { widget_type: "energy_chart", position: 3, is_visible: true },
  { widget_type: "sustainability_kpis", position: 4, is_visible: true },
  { widget_type: "alerts_list", position: 5, is_visible: true },
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
      // Check if weather widget exists, if not add it for existing users
      const hasWeatherWidget = data.some(w => w.widget_type === "weather");
      if (!hasWeatherWidget) {
        const maxPosition = Math.max(...data.map(w => w.position), 0);
        const { data: newWidget } = await supabase
          .from("dashboard_widgets")
          .insert({
            user_id: user.id,
            widget_type: "weather",
            position: maxPosition + 1,
            is_visible: true,
            config: {},
          })
          .select()
          .single();
        
        if (newWidget) {
          setWidgets([...data, newWidget] as DashboardWidget[]);
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

  useEffect(() => {
    fetchWidgets();
  }, [fetchWidgets]);

  const visibleWidgets = widgets
    .filter((w) => w.is_visible)
    .sort((a, b) => a.position - b.position);

  return {
    widgets,
    visibleWidgets,
    loading,
    toggleWidgetVisibility,
    reorderWidgets,
    refetch: fetchWidgets,
  };
}
