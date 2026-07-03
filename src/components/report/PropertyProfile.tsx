import { Location } from "@/hooks/useLocations";
import { Co2Factor } from "@/hooks/useCo2Factors";
import { ConsumptionByType } from "@/hooks/useLocationYearlyConsumption";
import { LocationCompleteness } from "@/hooks/useDataCompleteness";
import { EnergyMeasure } from "@/hooks/useEnergyMeasures";
import { EnergyPrice } from "@/hooks/useEnergyPrices";
import { BenchmarkIndicator } from "./BenchmarkIndicator";
import { DataCompletenessIndicator } from "./DataCompletenessIndicator";
import { MeasuresTable } from "./MeasuresTable";
import { AddMeasureDialog } from "./AddMeasureDialog";
import { calculateCo2, formatCo2 } from "@/lib/co2Calculations";
import { getActivePrice, calculateEnergyCost, formatCurrency } from "@/lib/costCalculations";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Calendar, Ruler, Flame, MapPin, User, Zap, Droplets, Leaf } from "lucide-react";

interface PropertyProfileProps {
  location: Location;
  reportYear: number;
  factors: Co2Factor[];
  consumption?: ConsumptionByType;
  completeness?: LocationCompleteness;
  measures?: EnergyMeasure[];
  prices?: EnergyPrice[];
  onAddMeasure?: (measure: any) => void;
  onDeleteMeasure?: (id: string) => void;
}

const ENERGY_LABELS: Record<string, string> = {
  strom: "Strom", gas: "Gas", waerme: "Wärme",
  wasser: "Wasser", oel: "Heizöl", pellets: "Pellets",
};

const ENERGY_ICONS: Record<string, typeof Zap> = {
  strom: Zap, wasser: Droplets,
};

function formatDE(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
}

export function PropertyProfile({
  location, reportYear, factors, consumption, completeness,
  measures, prices, onAddMeasure, onDeleteMeasure,
}: PropertyProfileProps) {
  const { t } = useTranslation();
  const loc = location;
  const hasConsumption = consumption && Object.keys(consumption).length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {loc.name}
            {loc.usage_type && (
              <Badge variant="outline" className="capitalize text-xs font-normal">
                {t(`locations.usage.${loc.usage_type}` as any) || loc.usage_type}
              </Badge>
            )}
          </CardTitle>
          {completeness && <DataCompletenessIndicator completeness={completeness} compact />}
        </div>
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

        {/* Consumption table */}
        {hasConsumption && (
          <div className="rounded-lg border p-4 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Verbrauchsdaten {reportYear}
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Energieträger</TableHead>
                  <TableHead className="text-right">Verbrauch</TableHead>
                  {loc.net_floor_area && <TableHead className="text-right">kWh/m²a</TableHead>}
                  <TableHead className="text-right">CO₂</TableHead>
                  {prices && prices.length > 0 && <TableHead className="text-right">Kosten</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(consumption!).map(([eType, kwh]) => {
                  const co2 = calculateCo2(kwh, eType, factors);
                  const specific = loc.net_floor_area ? kwh / loc.net_floor_area : null;
                  const price = prices ? getActivePrice(prices, loc.id, eType, reportYear) : 0;
                  const cost = price > 0 ? calculateEnergyCost(kwh, price) : null;

                  return (
                    <TableRow key={eType}>
                      <TableCell className="font-medium capitalize">{ENERGY_LABELS[eType] || eType}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatDE(kwh)} kWh</TableCell>
                      {loc.net_floor_area && (
                        <TableCell className="text-right tabular-nums">
                          {specific !== null ? specific.toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "–"}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {co2 !== null ? formatCo2(co2) : "–"}
                      </TableCell>
                      {prices && prices.length > 0 && (
                        <TableCell className="text-right tabular-nums">
                          {cost !== null ? formatCurrency(cost) : "–"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Benchmark indicators */}
        {loc.net_floor_area && loc.usage_type && hasConsumption && (
          <div className="rounded-lg border p-4 space-y-4">
            <h4 className="text-sm font-semibold">Energiekennwerte (Benchmark)</h4>
            {consumption!.strom && (
              <BenchmarkIndicator
                specificValue={consumption!.strom / loc.net_floor_area}
                usageType={loc.usage_type}
                energyType="strom"
              />
            )}
            {(consumption!.waerme || consumption!.gas || consumption!.oel) && (
              <BenchmarkIndicator
                specificValue={((consumption!.waerme || 0) + (consumption!.gas || 0) + (consumption!.oel || 0)) / loc.net_floor_area}
                usageType={loc.usage_type}
                energyType="waerme"
              />
            )}
            {consumption!.wasser && (
              <BenchmarkIndicator
                specificValue={consumption!.wasser / loc.net_floor_area}
                usageType={loc.usage_type}
                energyType="wasser"
              />
            )}
          </div>
        )}

        {/* No consumption hint */}
        {!hasConsumption && loc.net_floor_area && loc.usage_type && (
          <div className="rounded-lg border p-4 space-y-4">
            <h4 className="text-sm font-semibold">Energiekennwerte (Benchmark)</h4>
            <p className="text-xs text-muted-foreground">
              Kennwerte werden automatisch berechnet, sobald Verbrauchsdaten für {reportYear} vorliegen.
            </p>
          </div>
        )}

        {/* Data completeness detail */}
        {completeness && (
          <div className="rounded-lg border p-4">
            <DataCompletenessIndicator completeness={completeness} />
          </div>
        )}

        {/* CO2 summary */}
        {hasConsumption && factors.length > 0 && (
          <div className="rounded-lg border p-4 space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Leaf className="h-4 w-4" />
              CO₂-Bilanz
            </h4>
            <p className="text-lg font-bold">
              {formatCo2(
                Object.entries(consumption!).reduce((sum, [eType, kwh]) => {
                  const co2 = calculateCo2(kwh, eType, factors);
                  return sum + (co2 || 0);
                }, 0)
              )}
            </p>
          </div>
        )}

        {/* Measures */}
        {(measures && measures.length > 0) || onAddMeasure ? (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Energetische Maßnahmen</h4>
              {onAddMeasure && (
                <AddMeasureDialog locationId={loc.id} onSave={onAddMeasure} />
              )}
            </div>
            {measures && <MeasuresTable measures={measures} onDelete={onDeleteMeasure} />}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
