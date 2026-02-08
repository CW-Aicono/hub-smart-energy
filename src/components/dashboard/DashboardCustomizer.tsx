import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings2, GripVertical } from "lucide-react";
import { DashboardWidget } from "@/hooks/useDashboardWidgets";

interface DashboardCustomizerProps {
  widgets: DashboardWidget[];
  onToggleVisibility: (widgetType: string) => void;
}

const WIDGET_LABELS: Record<string, string> = {
  location_map: "Standortkarte",
  weather: "Lokales Wetter",
  cost_overview: "Kostenübersicht",
  energy_chart: "Energieverbrauch",
  sustainability_kpis: "Nachhaltigkeits-KPIs",
  alerts_list: "Alerts & Benachrichtigungen",
};

const DashboardCustomizer = ({ widgets, onToggleVisibility }: DashboardCustomizerProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-2" />
          Dashboard anpassen
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-sm mb-1">Widgets anzeigen</h4>
            <p className="text-xs text-muted-foreground">
              Wählen Sie, welche Widgets auf Ihrem Dashboard erscheinen sollen.
            </p>
          </div>
          <div className="space-y-3">
            {widgets.map((widget) => (
              <div
                key={widget.widget_type}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Label
                    htmlFor={widget.widget_type}
                    className="text-sm cursor-pointer"
                  >
                    {WIDGET_LABELS[widget.widget_type] || widget.widget_type}
                  </Label>
                </div>
                <Switch
                  id={widget.widget_type}
                  checked={widget.is_visible}
                  onCheckedChange={() => onToggleVisibility(widget.widget_type)}
                />
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DashboardCustomizer;
