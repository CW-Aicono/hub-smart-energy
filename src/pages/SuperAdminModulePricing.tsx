import { useState, useEffect, Fragment } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useModulePrices } from "@/hooks/useModulePrices";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Building2, Factory, CornerDownRight } from "lucide-react";
import { useActiveChargePoints } from "@/hooks/useActiveChargePoints";

const editableModules = ALL_MODULES.filter((m) => !("alwaysOn" in m));

interface PriceInputProps {
  currentPrice: number;
  unit: string;
  onSave: (val: number) => void;
}

const PriceInput = ({ currentPrice, unit, onSave }: PriceInputProps) => {
  const [value, setValue] = useState(String(currentPrice));

  useEffect(() => {
    setValue(String(currentPrice));
  }, [currentPrice]);

  return (
    <div className="flex items-center gap-2 w-36">
      <Input
        type="number" min={0} step={0.01}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        onBlur={() => {
          const val = parseFloat(value);
          if (!isNaN(val) && val !== currentPrice) onSave(val);
        }}
      />
      <span className="text-sm text-muted-foreground whitespace-nowrap">{unit}</span>
    </div>
  );
};

const SuperAdminModulePricing = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { prices, isLoading, updatePrice, getPrice, getStandardPrice, getIndustryPrice, getIndustryStandardPrice, getPartnerPrice, getPartnerIndustryPrice, getChargePointPrice } = useModulePrices();
  const { total: activeCpTotal } = useActiveChargePoints();
  const { t } = useSATranslation();
  const [sector, setSector] = useState<"kommune" | "industrie">("kommune");

  if (authLoading || roleLoading || isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">{t("module_pricing.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("module_pricing.subtitle")}</p>
        </header>
        <div className="p-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("module_pricing.monthly_defaults")}</CardTitle>
                <ToggleGroup
                  type="single"
                  value={sector}
                  onValueChange={(v) => { if (v) setSector(v as "kommune" | "industrie"); }}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="kommune" className="gap-1.5">
                    <Building2 className="h-4 w-4" />
                    Kommunen
                  </ToggleGroupItem>
                  <ToggleGroupItem value="industrie" className="gap-1.5">
                    <Factory className="h-4 w-4" />
                    Industrie
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4 mb-4 pb-2 border-b">
                <Label className="text-base flex-1 font-semibold">Modul</Label>
                <div className="flex gap-4">
                  <span className="text-sm font-semibold text-muted-foreground w-36 text-center">Partner-Einkauf</span>
                  <span className="text-sm font-semibold text-muted-foreground w-36 text-center">AICONO e.&thinsp;V.</span>
                  <span className="text-sm font-semibold text-muted-foreground w-36 text-center">Standardpreis</span>
                </div>
              </div>
              <div className="space-y-4">
                {editableModules.map((mod) => {
                  const unit = mod.code === "support_billing" ? "€/15Min" : "€/Mo";
                  const partnerPrice = sector === "kommune" ? getPartnerPrice(mod.code) : getPartnerIndustryPrice(mod.code);
                  const memberPrice = sector === "kommune" ? getPrice(mod.code) : getIndustryPrice(mod.code);
                  const stdPrice = sector === "kommune" ? getStandardPrice(mod.code) : getIndustryStandardPrice(mod.code);
                  const ind = sector === "industrie";
                  const cpPartner = getChargePointPrice(mod.code, ind ? "partner_industry_charge_point_price_monthly" : "partner_charge_point_price_monthly");
                  const cpMember = getChargePointPrice(mod.code, ind ? "industry_charge_point_price_monthly" : "charge_point_price_monthly");
                  const cpStd = getChargePointPrice(mod.code, ind ? "industry_standard_charge_point_price_monthly" : "standard_charge_point_price_monthly");
                  const saveCp = (field: any, val: number) => updatePrice.mutate({ moduleCode: mod.code, cpFields: { [field]: val } });
                  return (
                    <Fragment key={mod.code}>
                    <div className="flex items-center justify-between gap-4">
                      <Label className="text-base flex-1">{mod.label}</Label>
                      <div className="flex gap-4">
                        <PriceInput
                          currentPrice={partnerPrice}
                          unit={unit}
                          onSave={(val) =>
                            updatePrice.mutate(
                              sector === "kommune"
                                ? { moduleCode: mod.code, partnerPriceMonthly: val }
                                : { moduleCode: mod.code, partnerIndustryPriceMonthly: val }
                            )
                          }
                        />
                        <PriceInput
                          currentPrice={memberPrice}
                          unit={unit}
                          onSave={(val) =>
                            updatePrice.mutate(
                              sector === "kommune"
                                ? { moduleCode: mod.code, priceMonthly: val }
                                : { moduleCode: mod.code, industryPriceMonthly: val }
                            )
                          }
                        />
                        <PriceInput
                          currentPrice={stdPrice}
                          unit={unit}
                          onSave={(val) =>
                            updatePrice.mutate(
                              sector === "kommune"
                                ? { moduleCode: mod.code, standardPrice: val }
                                : { moduleCode: mod.code, industryStandardPrice: val }
                            )
                          }
                        />
                      </div>
                    </div>
                    {mod.code === "ev_charging" && (
                      <div className="flex items-center justify-between gap-4 pl-4 -mt-2 pb-2 border-b border-dashed">
                        <div className="flex-1">
                          <Label className="text-sm flex items-center gap-1.5 text-muted-foreground"><CornerDownRight className="h-3.5 w-3.5" />je aktivem Ladepunkt / Monat</Label>
                          <span className="text-[11px] text-muted-foreground pl-5">
                            aktuell {activeCpTotal.toLocaleString("de-DE")} aktive Ladepunkte → Standard {(cpStd * activeCpTotal).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/Mo
                          </span>
                        </div>
                        <div className="flex gap-4">
                          <PriceInput currentPrice={cpPartner} unit="€/LP" onSave={(v) => saveCp(ind ? "partner_industry_charge_point_price_monthly" : "partner_charge_point_price_monthly", v)} />
                          <PriceInput currentPrice={cpMember} unit="€/LP" onSave={(v) => saveCp(ind ? "industry_charge_point_price_monthly" : "charge_point_price_monthly", v)} />
                          <PriceInput currentPrice={cpStd} unit="€/LP" onSave={(v) => saveCp(ind ? "industry_standard_charge_point_price_monthly" : "standard_charge_point_price_monthly", v)} />
                        </div>
                      </div>
                    )}
                    </Fragment>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-6">
                <strong>Partner-Einkauf</strong>: Einstandspreis für Vertriebspartner im Wiederverkaufs-Modell.{" "}
                <strong>AICONO e.&thinsp;V.</strong>: Vergünstigter Mitgliederpreis.{" "}
                <strong>Standardpreis</strong>: empfohlener Endkundenpreis (auch Default-Verkaufspreis für Partner).{" "}
                <strong>Je aktivem Ladepunkt</strong> (Unterpunkt von Ladeinfrastruktur): zusätzlich zur Pauschale; 0 € = nicht berechnet. Aktiv = in den letzten 30 Tagen verbunden.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Rabatte (auch für Bundles, mit Laufzeit, Vorkasse oder Einmalzahlung) stellen Sie pro Kunde ein:{" "}
                <Link to="/super-admin/tenants" className="text-primary underline">Mandanten → Kunde → Module</Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminModulePricing;
