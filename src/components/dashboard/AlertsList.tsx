import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { alerts } from "@/data/mockData";
import { AlertTriangle, Info, CheckCircle, Bell } from "lucide-react";

const iconMap = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
};

const colorMap = {
  warning: "text-chart-3",
  info: "text-chart-4",
  success: "text-accent",
};

const AlertsList = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Alerts & Benachrichtigungen
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {alerts.map((alert) => {
            const Icon = iconMap[alert.type];
            return (
              <div key={alert.id} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${colorMap[alert.type]}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{alert.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default AlertsList;
