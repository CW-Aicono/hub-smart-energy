import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIntegrationErrors } from "@/hooks/useIntegrationErrors";
import { useLocations } from "@/hooks/useLocations";
import { AlertOctagon, CheckCircle2, Wifi, Database, Server } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface IntegrationErrorsWidgetProps {
  locationId: string | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  error: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  info: "bg-primary/10 text-primary border-primary/20",
};

const ERROR_TYPE_ICONS: Record<string, typeof Wifi> = {
  connection: Wifi,
  data: Database,
  auth: Server,
};

const IntegrationErrorsWidget = ({ locationId }: IntegrationErrorsWidgetProps) => {
  const { errors, loading } = useIntegrationErrors();
  const { locations } = useLocations();

  const filtered = locationId
    ? errors.filter((e) => e.location_id === locationId)
    : errors;

  const locationMap = new Map(locations.map((l) => [l.id, l.name]));

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
          <AlertOctagon className="h-5 w-5 text-destructive" />
          Integrations-Fehlermeldungen
          {filtered.length > 0 && (
            <Badge variant="destructive" className="ml-auto text-xs">
              {filtered.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
            <CheckCircle2 className="h-10 w-10 text-chart-2 opacity-60" />
            <p>Keine aktiven Fehlermeldungen</p>
            <p className="text-xs">Alle Integrationen laufen fehlerfrei</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {filtered.map((err) => {
              const IconComp = ERROR_TYPE_ICONS[err.error_type] || AlertOctagon;
              const locationName = err.location_id ? locationMap.get(err.location_id) : null;
              const timeAgo = formatDistanceToNow(new Date(err.created_at), {
                addSuffix: true,
                locale: de,
              });

              return (
                <div
                  key={err.id}
                  className={`flex gap-3 p-3 rounded-lg border ${SEVERITY_STYLES[err.severity] || SEVERITY_STYLES.error}`}
                >
                  <IconComp className="h-5 w-5 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-normal">
                        {err.integration_type}
                      </Badge>
                      {locationName && (
                        <span className="text-xs text-muted-foreground">
                          {locationName}
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1">{err.error_message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default IntegrationErrorsWidget;
