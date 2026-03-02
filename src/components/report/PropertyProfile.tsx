import { Location } from "@/hooks/useLocations";
import { Co2Factor } from "@/hooks/useCo2Factors";
import { BenchmarkIndicator } from "./BenchmarkIndicator";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Calendar, Ruler, Flame, MapPin, User } from "lucide-react";

interface PropertyProfileProps {
  location: Location;
  reportYear: number;
  factors: Co2Factor[];
}

export function PropertyProfile({ location, reportYear, factors }: PropertyProfileProps) {
  const { t } = useTranslation();
  const loc = location;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {loc.name}
          {loc.usage_type && (
            <Badge variant="outline" className="capitalize text-xs font-normal">
              {t(`locations.usage.${loc.usage_type}` as any) || loc.usage_type}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master data grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loc.address && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("common.address" as any) || "Adresse"}</p>
                <p className="text-sm">{loc.address}, {loc.postal_code} {loc.city}</p>
              </div>
            </div>
          )}
          {loc.construction_year && (
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("building.constructionYear" as any) || "Baujahr"}</p>
                <p className="text-sm">{loc.construction_year}{loc.renovation_year ? ` (San. ${loc.renovation_year})` : ""}</p>
              </div>
            </div>
          )}
          {loc.net_floor_area && (
            <div className="flex items-start gap-2">
              <Ruler className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">NGF / BGF</p>
                <p className="text-sm">
                  {loc.net_floor_area.toLocaleString("de-DE")} m²
                  {loc.gross_floor_area ? ` / ${loc.gross_floor_area.toLocaleString("de-DE")} m²` : ""}
                </p>
              </div>
            </div>
          )}
          {loc.heating_type && (
            <div className="flex items-start gap-2">
              <Flame className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{t("building.heatingType" as any) || "Heizungsart"}</p>
                <p className="text-sm">{loc.heating_type}</p>
              </div>
            </div>
          )}
        </div>

        {/* Contact */}
        {loc.contact_person && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            {loc.contact_person}
            {loc.contact_email && ` · ${loc.contact_email}`}
            {loc.contact_phone && ` · ${loc.contact_phone}`}
          </div>
        )}

        {/* Energy sources */}
        {loc.energy_sources && loc.energy_sources.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {loc.energy_sources.map((src) => (
              <Badge key={src} variant="secondary" className="capitalize text-xs">
                {src}
              </Badge>
            ))}
          </div>
        )}

        {/* Benchmark indicators (only if NGF is available) */}
        {loc.net_floor_area && loc.usage_type && (
          <div className="rounded-lg border p-4 space-y-4">
            <h4 className="text-sm font-semibold">{t("benchmark.title" as any) || "Energiekennwerte (Benchmark)"}</h4>
            <p className="text-xs text-muted-foreground">
              {t("benchmark.hint" as any) || "Kennwerte werden aus den Verbrauchsdaten und der Nettogrundfläche berechnet. Die Anzeige aktualisiert sich automatisch, sobald Daten vorliegen."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
