import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
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
import { Building2, Factory } from "lucide-react";

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
  const { prices, isLoading, updatePrice, getPrice, getStandardPrice, getIndustryPrice, getIndustryStandardPrice } = useModulePrices();
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
              {/* Column headers */}
              <div className="flex items-center justify-between gap-4 mb-4 pb-2 border-b">
                <Label className="text-base flex-1 font-semibold">Modul</Label>
                <div className="flex gap-4">
                  <span className="text-sm font-semibold text-muted-foreground w-36 text-center">AICONO e.&thinsp;V.</span>
                  <span className="text-sm font-semibold text-muted-foreground w-36 text-center">Standardpreis</span>
                </div>
              </div>
              <div className="space-y-4">
                {editableModules.map((mod) => {
                  const unit = mod.code === "support_billing" ? "€/15Min" : "€/Mo";
                  const memberPrice = sector === "kommune" ? getPrice(mod.code) : getIndustryPrice(mod.code);
                  const stdPrice = sector === "kommune" ? getStandardPrice(mod.code) : getIndustryStandardPrice(mod.code);
                  return (
                    <div key={mod.code} className="flex items-center justify-between gap-4">
                      <Label className="text-base flex-1">{mod.label}</Label>
                      <div className="flex gap-4">
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
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-6">{t("module_pricing.hint")}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminModulePricing;
