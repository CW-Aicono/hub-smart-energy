import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { SalesRulesManager } from "@/components/sales/SalesRulesManager";

export default function PartnerSalesRules() {
  const { partnerId, isPartnerAdmin, loading } = usePartnerAccess();
  if (loading) return <div className="p-6 text-muted-foreground">Lade …</div>;
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SalesRulesManager scope="partner" partnerId={partnerId} canManage={isPartnerAdmin} />
    </div>
  );
}
