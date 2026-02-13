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
import { Euro } from "lucide-react";

const SuperAdminModulePricing = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { prices, isLoading, updatePrice, getPrice } = useModulePrices();
  const { t } = useSATranslation();

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const editableModules = ALL_MODULES.filter((m) => !("alwaysOn" in m));

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
            <CardHeader><CardTitle>{t("module_pricing.monthly_defaults")}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {editableModules.map((mod) => {
                  const currentPrice = getPrice(mod.code);
                  return (
                    <div key={mod.code} className="flex items-center justify-between gap-4">
                      <Label className="text-base flex-1">{mod.label}</Label>
                      <div className="flex items-center gap-2 w-48">
                        <Input
                          type="number" min={0} step={0.01}
                          defaultValue={currentPrice}
                          className="text-right"
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val !== currentPrice) updatePrice.mutate({ moduleCode: mod.code, priceMonthly: val });
                          }}
                        />
                        <span className="text-sm text-muted-foreground">€/Mo</span>
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
