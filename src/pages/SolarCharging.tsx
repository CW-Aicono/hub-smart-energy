import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import SolarChargingConfig from "@/components/charging/SolarChargingConfig";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Sun } from "lucide-react";

const SolarCharging = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 space-y-6 max-w-5xl">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sun className="h-6 w-6 text-yellow-500" />
                PV-Überschussladen
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Ladepunkte dynamisch an den aktuellen PV-Überschuss anpassen
              </p>
            </div>
            <SolarChargingConfig />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default SolarCharging;
