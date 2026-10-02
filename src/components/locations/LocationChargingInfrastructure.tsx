import { useNavigate } from "react-router-dom";
import { useLocationChargePoints, type LocationChargePoint } from "@/hooks/useLocationChargePoints";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlugZap, Wifi, WifiOff, Users, MapPin, ExternalLink, Zap } from "lucide-react";
import { format } from "date-fns";

const fmtKwh = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kWh`;
const fmtKw = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kW`;

interface Props {
  locationId: string;
}

export function LocationChargingInfrastructure({ locationId }: Props) {
  const { data: chargePoints = [], isLoading } = useLocationChargePoints(locationId);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (chargePoints.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Noch keine Ladepunkte dieser Liegenschaft zugeordnet.
      </p>
    );
  }

  const totalKwh = chargePoints.reduce((s, cp) => s + cp.total_kwh, 0);
  const totalKwh30 = chargePoints.reduce((s, cp) => s + cp.kwh_last_30d, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Ladepunkte</p>
            <p className="text-lg font-semibold">{chargePoints.length.toLocaleString("de-DE")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Gesamt geladen</p>
            <p className="text-lg font-semibold">{fmtKwh(totalKwh)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Letzte 30 Tage</p>
            <p className="text-lg font-semibold">{fmtKwh(totalKwh30)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        {chargePoints.map((cp) => (
          <ChargePointRow key={cp.id} cp={cp} onOpen={() => navigate(`/charging/points/${cp.id}`)} />
        ))}
      </div>
    </div>
  );
}

function ChargePointRow({ cp, onOpen }: { cp: LocationChargePoint; onOpen: () => void }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <PlugZap className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium truncate">{cp.name}</p>
              {cp.ws_connected ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                  <Wifi className="h-3 w-3" /> Online
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <WifiOff className="h-3 w-3" /> Offline
                </Badge>
              )}
              {cp.assignment_source === "group" ? (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Users className="h-3 w-3" /> Gruppe: {cp.group_name}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <MapPin className="h-3 w-3" /> direkt
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{cp.ocpp_id ?? "—"}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Zählerstand</p>
            <p className="font-semibold flex items-center gap-1 justify-end">
              <Zap className="h-3.5 w-3.5 text-primary" />
              {fmtKwh(cp.total_kwh)}
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-[11px] text-muted-foreground">Letzte 30 Tage</p>
            <p className="font-medium">{fmtKwh(cp.kwh_last_30d)}</p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-[11px] text-muted-foreground">Max. Leistung</p>
            <p className="font-medium">{fmtKw(cp.max_power_kw)}</p>
          </div>
          <div className="text-right hidden lg:block">
            <p className="text-[11px] text-muted-foreground">Letzter Vorgang</p>
            <p className="font-medium">
              {cp.last_session_at ? format(new Date(cp.last_session_at), "dd.MM.yyyy HH:mm") : "—"}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onOpen}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
