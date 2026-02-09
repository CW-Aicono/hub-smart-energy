import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings2, GripVertical, RotateCcw } from "lucide-react";
import { DashboardWidget } from "@/hooks/useDashboardWidgets";
import { cn } from "@/lib/utils";

interface DashboardCustomizerProps {
  widgets: DashboardWidget[];
  onToggleVisibility: (widgetType: string) => void;
  onReorder: (newOrder: string[]) => void;
  onResetLayout?: () => void;
}

const WIDGET_LABELS: Record<string, string> = {
  location_map: "Standortkarte",
  weather: "Lokales Wetter",
  cost_overview: "Kostenübersicht",
  energy_chart: "Energieverbrauch",
  sustainability_kpis: "Nachhaltigkeits-KPIs",
  alerts_list: "Alerts & Benachrichtigungen",
  floor_plan_explorer: "Grundriss-Explorer",
  pie_chart: "Kreisdiagramm",
  sankey: "Sankey-Diagramm",
};

const DashboardCustomizer = ({ widgets, onToggleVisibility, onReorder, onResetLayout }: DashboardCustomizerProps) => {
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
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-2" />
          Dashboard anpassen
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 bg-popover border shadow-lg z-50">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">Widgets anzeigen</h4>
            <p className="text-xs text-muted-foreground">
              Ziehen Sie die Widgets, um die Reihenfolge zu ändern.
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
                    {WIDGET_LABELS[widget.widget_type] || widget.widget_type}
                  </Label>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
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
              Layout zurücksetzen
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DashboardCustomizer;
