import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { SalesCatalogManager } from "@/components/sales/SalesCatalogManager";

export default function SuperAdminSalesCatalog() {
  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="mx-auto max-w-7xl">
          <SalesCatalogManager scope="global" canManage />
        </div>
      </main>
    </div>
  );
}
