import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Wifi, Router, Activity, Server, Shield, Globe, Cable } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useLocationIntegrations, useIntegrations } from "@/hooks/useIntegrations";
import { useLocations } from "@/hooks/useLocations";
import { useTenant } from "@/hooks/useTenant";
import { AddIntegrationDialog } from "@/components/integrations/AddIntegrationDialog";
import { getGatewayDefinition } from "@/lib/gatewayRegistry";

const NetworkInfrastructure = () => {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { locations } = useLocations();
  const { integrations } = useIntegrations();

  if (authLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  // Filter Omada integrations
  const omadaIntegrations = integrations.filter((i) => i.type === "omada_cloud");

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Network className="h-6 w-6" />
                {t("nav.networkInfrastructure" as any)}
              </h1>
              <p className="text-muted-foreground mt-1">
                Überwachung und Verwaltung der Netzwerkinfrastruktur Ihrer Gebäude
              </p>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Router className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Gateways</p>
                    <p className="text-2xl font-bold text-foreground">{omadaIntegrations.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent">
                    <Wifi className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Access Points</p>
                    <p className="text-2xl font-bold text-foreground">–</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent">
                    <Cable className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Switches</p>
                    <p className="text-2xl font-bold text-foreground">–</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent">
                    <Activity className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">PoE-Verbrauch</p>
                    <p className="text-2xl font-bold text-foreground">– W</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Übersicht</TabsTrigger>
              <TabsTrigger value="devices">Geräte</TabsTrigger>
              <TabsTrigger value="integrations">Integrationen</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Netzwerkstatus
                  </CardTitle>
                  <CardDescription>
                    Übersicht über den Status Ihrer Netzwerkinfrastruktur
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {omadaIntegrations.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Keine Netzwerk-Integrationen konfiguriert</p>
                      <p className="mt-1">
                        Verbinden Sie einen TP-Link Omada Controller über die Integrationen-Seite eines Standorts.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {omadaIntegrations.map((integration) => (
                        <div
                          key={integration.id}
                          className="flex items-center justify-between p-4 rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Server className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{integration.name}</p>
                              <p className="text-sm text-muted-foreground">TP-Link Omada Cloud</p>
                            </div>
                          </div>
                          <Badge variant={integration.is_active ? "default" : "secondary"}>
                            {integration.is_active ? "Aktiv" : "Inaktiv"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="devices" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5" />
                    Netzwerkgeräte
                  </CardTitle>
                  <CardDescription>
                    Access Points, Switches und Gateways aus Ihren Omada-Controllern
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <Wifi className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Geräte werden nach Verbindung eines Omada-Controllers angezeigt.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="integrations" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Omada-Integrationen
                  </CardTitle>
                  <CardDescription>
                    Verwalten Sie die Verbindungen zu Ihren TP-Link Omada Controllern
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {omadaIntegrations.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Router className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Noch keine Omada-Integration</p>
                      <p className="mt-2">
                        Um Netzwerkgeräte zu überwachen, fügen Sie eine Omada-Integration bei einem Standort hinzu.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {omadaIntegrations.map((integration) => (
                        <div
                          key={integration.id}
                          className="flex items-center justify-between p-4 rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <Router className="h-5 w-5 text-primary" />
                            <div>
                              <p className="font-medium text-foreground">{integration.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {integration.description || "TP-Link Omada Cloud Controller"}
                              </p>
                            </div>
                          </div>
                          <Badge variant={integration.is_active ? "default" : "secondary"}>
                            {integration.is_active ? "Verbunden" : "Getrennt"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default NetworkInfrastructure;
