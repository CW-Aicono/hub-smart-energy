import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Wifi, Router, Activity, Cable } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { DEMO_NETWORK_DEVICES, type NetworkDevice } from "@/data/networkDemoData";
import NetworkOverview from "@/components/network/NetworkOverview";
import NetworkDevicesTable from "@/components/network/NetworkDevicesTable";

const NetworkInfrastructure = () => {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [devices, setDevices] = useState<NetworkDevice[]>(DEMO_NETWORK_DEVICES);

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const totalPoe = devices.reduce((s, d) => s + (d.poeConsumption ?? 0), 0);
  const apCount = devices.filter((d) => d.type === "access_point").length;
  const swCount = devices.filter((d) => d.type === "switch").length;
  const gwCount = devices.filter((d) => d.type === "gateway").length;
  const totalClients = devices.reduce((s, d) => s + (d.clients ?? 0), 0);

  const handleUpdateDevice = (updated: NetworkDevice) => {
    setDevices((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Network className="h-6 w-6" />
              {t("nav.networkInfrastructure" as any)}
            </h1>
            <p className="text-muted-foreground mt-1">
              Überwachung und Verwaltung der Netzwerkinfrastruktur Ihrer Gebäude
            </p>
          </div>

          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard icon={<Router className="h-5 w-5 text-primary" />} label="Gateways" value={String(gwCount)} />
            <StatCard icon={<Wifi className="h-5 w-5 text-primary" />} label="Access Points" value={String(apCount)} />
            <StatCard icon={<Cable className="h-5 w-5 text-primary" />} label="Switches" value={String(swCount)} />
            <StatCard icon={<Activity className="h-5 w-5 text-primary" />} label="PoE-Verbrauch" value={`${totalPoe.toFixed(1)} W`} sub={`${totalClients} Clients`} />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Übersicht</TabsTrigger>
              <TabsTrigger value="devices">Geräte</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <NetworkOverview devices={devices} />
            </TabsContent>

            <TabsContent value="devices" className="mt-4">
              <NetworkDevicesTable devices={devices} onUpdateDevice={handleUpdateDevice} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default NetworkInfrastructure;
