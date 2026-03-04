import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIntegrationErrors } from "@/hooks/useIntegrationErrors";
import { useLocations } from "@/hooks/useLocations";
import { AlertOctagon, CheckCircle2, Wifi, Database, Server, CircleAlert, EyeOff, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, isToday, isYesterday } from "date-fns";
import { de } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  system_status: Server,
};

function formatErrorTime(dateStr: string): string {
  const date = new Date(dateStr);
  const time = format(date, "HH:mm", { locale: de });
  if (isToday(date)) return `Heute, ${time}`;
  if (isYesterday(date)) return `Gestern, ${time}`;
  return format(date, "dd.MM.yyyy, HH:mm", { locale: de });
}

const IntegrationErrorsWidget = ({ locationId }: IntegrationErrorsWidgetProps) => {
  const { errors, loading, ignoreErrors, resolveErrors } = useIntegrationErrors();
  const { locations } = useLocations();

  const locationFiltered = locationId
    ? errors.filter((e) => e.location_id === locationId)
    : errors;

  // Deduplicate: group by error_message + integration_type + sensor_name, keep newest
  const deduped = (() => {
    const map = new Map<string, { error: typeof locationFiltered[0]; count: number; allIds: string[] }>();
    for (const err of locationFiltered) {
      const key = `${err.error_message}||${err.integration_type}||${err.sensor_name || ""}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { error: err, count: 1, allIds: [err.id] });
      } else {
        existing.allIds.push(err.id);
        existing.count++;
        if (new Date(err.created_at) > new Date(existing.error.created_at)) {
          existing.error = err;
        }
      }
    }
    return Array.from(map.values());
  })();

  const filtered = deduped;
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
          Aktive Meldungen
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
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {filtered.map(({ error: err, count, allIds }) => {
              const locationName = err.location_id ? locationMap.get(err.location_id) : null;
              const timeStr = formatErrorTime(err.created_at);
              const hasSensor = !!(err as any).sensor_name;

              return (
                <div
                  key={err.id}
                  className={`p-3 rounded-lg border ${SEVERITY_STYLES[err.severity] || SEVERITY_STYLES.error}`}
                >
                  {/* Top line: timestamp • location */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-destructive shrink-0" />
                    <span>{timeStr}</span>
                    {locationName && (
                      <>
                        <span>•</span>
                        <span>{locationName}</span>
                      </>
                    )}
                    {/* Action buttons */}
                    <div className="ml-auto flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => resolveErrors.mutate(allIds)}
                            disabled={resolveErrors.isPending}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {count > 1 ? `Alle ${count} als erledigt markieren` : "Als erledigt markieren"}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => ignoreErrors.mutate(allIds)}
                            disabled={ignoreErrors.isPending}
                          >
                            <EyeOff className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {count > 1 ? `Alle ${count} ignorieren` : "Ignorieren"}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  {/* Error content */}
                  <div className="flex items-start gap-2.5">
                    <CircleAlert className="h-5 w-5 mt-0.5 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {err.error_message}
                        {count > 1 && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">({count}×)</span>
                        )}
                      </p>
                      {hasSensor && (
                        <p className="text-sm text-muted-foreground">
                          {(err as any).sensor_name}
                          {(err as any).sensor_type && ` (${(err as any).sensor_type})`}
                        </p>
                      )}
                      {!hasSensor && (
                        <p className="text-sm text-muted-foreground">{err.integration_type}</p>
                      )}
                    </div>
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
