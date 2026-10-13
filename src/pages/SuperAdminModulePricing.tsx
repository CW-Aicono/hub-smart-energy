import { useState, useEffect, Fragment } from "react";
import { PackageCatalogCard } from "@/components/billing/PackagePricing";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePortalMember as useSuperAdmin } from "@/hooks/usePortalAccess";
import { useModulePrices } from "@/hooks/useModulePrices";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import ModulePricingTabs from "@/components/super-admin/ModulePricingTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CornerDownRight } from "lucide-react";
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
  const { prices, isLoading, updatePrice, getStandardPrice, getPartnerPrice, getChargePointPrice } = useModulePrices();
  const { total: activeCpTotal } = useActiveChargePoints();
  const { t } = useSATranslation();

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
          <h1 className="text-2xl font-bold">{t("nav.bundles_modules")}</h1>
        </header>
        <ModulePricingTabs />
        <div className="p-6 space-y-6">
          <PackageCatalogCard canEdit />
          {/* Legacy-Einzelmodulpreise (module_prices) bleiben für Bestandskunden-Abrechnung aktiv, werden hier aber nicht mehr angezeigt. */}
        </div>
      </main>
    </div>
  );
};

export default SuperAdminModulePricing;
