import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAlertRules } from "@/hooks/useAlertRules";
import { AlertTriangle, Info, CheckCircle, Bell } from "lucide-react";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";

interface AlertsListProps {
  locationId: string | null;
}

const AlertsList = ({ locationId }: AlertsListProps) => {
  const { alertRules, loading } = useAlertRules();
  const { t } = useTranslation();

  const filtered = locationId
    ? alertRules.filter((r) => r.location_id === locationId || !r.location_id)
    : alertRules;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-[200px]" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t("alerts.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {t("alerts.none")}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((rule) => (
              <div key={rule.id} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                {rule.is_active ? (
                  <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-chart-3" />
                ) : (
                  <Info className="h-5 w-5 mt-0.5 shrink-0 text-chart-4" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(`energy.${rule.energy_type}`)} – {t("alerts.threshold")}: {rule.threshold_value} ({rule.threshold_type === "above" ? t("alerts.above") : t("alerts.below")})
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {rule.is_active ? t("alerts.active") : t("alerts.inactive")}
                  </p>
                </div>
              </div>
            ))}
            <AiDisclaimer
              text="Schwellenwert-Alarme dienen der Orientierung. Keine Haftung für verspätete oder ausbleibende Benachrichtigungen."
              showAgbLink={true}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AlertsList;
