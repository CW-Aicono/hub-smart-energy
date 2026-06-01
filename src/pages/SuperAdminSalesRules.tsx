import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { SalesRulesManager } from "@/components/sales/SalesRulesManager";

export default function SuperAdminSalesRules() {
  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="mx-auto max-w-7xl">
          <SalesRulesManager scope="global" canManage />
        </div>
      </main>
    </div>
  );
}
