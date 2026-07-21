import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import ChargingAppContent from "./ChargingAppContent";
import { useTranslation } from "@/hooks/useTranslation";

const ChargingAppAdmin = () => {
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{T("chargingApp.title")}</h1>
            <p className="text-sm text-muted-foreground">{T("chargingApp.subtitle")}</p>
          </div>
          <ChargingAppContent />
        </div>
      </main>
    </div>
  );
};

export default ChargingAppAdmin;
