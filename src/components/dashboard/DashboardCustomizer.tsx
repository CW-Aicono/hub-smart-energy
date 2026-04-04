import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings2, GripVertical, RotateCcw } from "lucide-react";
import { DashboardWidget, WidgetSize } from "@/hooks/useDashboardWidgets";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface DashboardCustomizerProps {
  widgets: DashboardWidget[];
  onToggleVisibility: (widgetType: string) => void;
  onReorder: (newOrder: string[]) => void;
  onResizeWidget: (widgetType: string, size: WidgetSize) => void;
  onResetLayout?: () => void;
  customWidgetNames?: Record<string, string>;
}

const WIDGET_LABEL_KEYS: Record<string, string> = {
  location_map: "widget.locationMap",
  weather: "widget.weather",
  energy_gauge: "widget.energyGauge",
  cost_overview: "widget.costOverview",
  energy_chart: "widget.energyChart",
  sustainability_kpis: "widget.sustainabilityKpis",
  alerts_list: "widget.alertsList",
  floor_plan_explorer: "widget.floorPlanExplorer",
  pie_chart: "widget.pieChart",
  sankey: "widget.sankey",
  forecast: "widget.forecast",
  anomaly: "widget.anomaly",
  weather_normalization: "widget.weatherNorm",
  spot_price: "widget.spotPrice",
  pv_forecast: "widget.pvForecast",
  arbitrage_ai: "widget.arbitrageAi",
  integration_errors: "widget.integrationErrors",
};

const SIZE_LABEL_KEYS: Record<WidgetSize, string> = {
  "full": "widget.sizeFull",
  "2/3": "widget.sizeTwoThirds",
  "1/2": "widget.sizeHalf",
  "1/3": "widget.sizeOneThird",
};

const DashboardCustomizer = ({ widgets, onToggleVisibility, onReorder, onResizeWidget, onResetLayout, customWidgetNames = {} }: DashboardCustomizerProps) => {
  const { t } = useTranslation();
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  const sortedWidgets = [...widgets].sort((a, b) => a.position - b.position);

  const handleDragStart = (e: React.DragEvent, widgetType: string) => {
    setDraggedItem(widgetType);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", widgetType);
  };

  const handleDragOver = (e: React.DragEvent, widgetType: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (widgetType !== draggedItem) {
      setDragOverItem(widgetType);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetWidgetType: string) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem === targetWidgetType) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const currentOrder = sortedWidgets.map(w => w.widget_type);
    const draggedIndex = currentOrder.indexOf(draggedItem);
    const targetIndex = currentOrder.indexOf(targetWidgetType);

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedItem);

    onReorder(newOrder);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("dashboard.customize" as any)}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-96 bg-popover border shadow-lg z-50">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">{t("dashboard.showWidgets" as any)}</h4>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.dragWidgets" as any)}
            </p>
          </div>
          <div className="space-y-2">
            {sortedWidgets.map((widget) => (
              <div
                key={widget.widget_type}
                draggable
                onDragStart={(e) => handleDragStart(e, widget.widget_type)}
                onDragOver={(e) => handleDragOver(e, widget.widget_type)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, widget.widget_type)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg bg-muted/50 cursor-grab active:cursor-grabbing transition-all gap-2",
                  draggedItem === widget.widget_type && "opacity-50 scale-95",
                  dragOverItem === widget.widget_type && "ring-2 ring-primary ring-offset-1"
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Label
                    htmlFor={widget.widget_type}
                    className="text-sm cursor-grab truncate"
                  >
                    {customWidgetNames[widget.widget_type] || t((WIDGET_LABEL_KEYS[widget.widget_type] || widget.widget_type) as any)}
                  </Label>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Select
                    value={widget.widget_size || "full"}
                    onValueChange={(value) => onResizeWidget(widget.widget_type, value as WidgetSize)}
                  >
                    <SelectTrigger className="h-7 w-[100px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(SIZE_LABEL_KEYS) as [WidgetSize, string][]).map(([value, key]) => (
                        <SelectItem key={value} value={value} className="text-xs">
                          {t(key as any)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Switch
                    id={widget.widget_type}
                    checked={widget.is_visible}
                    onCheckedChange={() => onToggleVisibility(widget.widget_type)}
                  />
                </div>
              </div>
            ))}
          </div>
          {onResetLayout && (
            <Button variant="outline" size="sm" className="w-full" onClick={onResetLayout}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {t("dashboard.resetLayout" as any)}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DashboardCustomizer;
