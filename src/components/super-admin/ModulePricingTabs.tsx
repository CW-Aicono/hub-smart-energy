import { useLocation, useNavigate } from "react-router-dom";
import { Tags, Package } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSATranslation } from "@/hooks/useSATranslation";

export default function ModulePricingTabs() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useSATranslation();

  return (
    <Tabs value={pathname} onValueChange={navigate} className="border-b px-6 py-3">
      <TabsList aria-label={t("nav.bundles_modules")}>
        <TabsTrigger value="/super-admin/module-pricing" className="gap-2">
          <Tags className="h-4 w-4" />{t("nav.module_pricing")}
        </TabsTrigger>
        <TabsTrigger value="/super-admin/bundles" className="gap-2">
          <Package className="h-4 w-4" />{t("nav.bundles")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}