import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { SalesCatalogManager } from "@/components/sales/SalesCatalogManager";

export default function PartnerSalesCatalog() {
  const { partnerId, isPartnerAdmin, loading } = usePartnerAccess();
  if (loading) return <div className="p-6 text-muted-foreground">Lade …</div>;
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SalesCatalogManager scope="partner" partnerId={partnerId} canManage={isPartnerAdmin} />
    </div>
  );
}
