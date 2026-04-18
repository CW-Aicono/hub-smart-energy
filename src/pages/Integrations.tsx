import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link, Navigate } from "react-router-dom";
import { ScannerManagement } from "@/components/integrations/ScannerManagement";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useIntegrations, Integration } from "@/hooks/useIntegrations";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Server, Loader2, Plug, Wifi, WifiOff, Globe, Smartphone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiSettings } from "@/components/settings/ApiSettings";
import { getGatewayDefinition } from "@/lib/gatewayRegistry";

const Integrations = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { t } = useTranslation();
  const { integrations, categories, loading, updateIntegration, refetch } = useIntegrations();
  const [testingId, setTestingId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleTestConnection = async (integration: Integration) => {
    setTestingId(integration.id);
    const config = integration.config as Record<string, unknown> | null;
    const gatewayDef = getGatewayDefinition(integration.type);
    const gatewayLabel = gatewayDef?.label || integration.type;

    const { data: locIntegrations } = await supabase
      .from("location_integrations")
      .select("id, config")
      .eq("integration_id", integration.id)
      .limit(1);

    if (!locIntegrations?.length) {
      setTestingId(null);
      toast({
        title: t("integrations.noLocationLinked" as any),
        description: `${t("integrations.noLocationLinkedDesc" as any)}`,
        variant: "destructive",
      });
      return;
    }

    const locConfig = locIntegrations[0].config as Record<string, unknown> | null;
    const requiredFields = gatewayDef?.configFields.filter(f => f.required) || [];
    const missingFields = requiredFields.filter(f => !locConfig?.[f.name]);

    if (missingFields.length > 0) {
      setTestingId(null);
      await updateIntegration(integration.id, {
        config: { ...config, connection_status: "disconnected", last_tested_at: new Date().toISOString() },
      });
      refetch();
      toast({
        title: t("integrations.testFailed" as any),
        description: `${t("integrations.missingConfig" as any)} ${gatewayLabel}: ${missingFields.map(f => f.label).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    try {
      const edgeFunction = gatewayDef?.edgeFunctionName || "loxone-api";
      const { data, error: fnError } = await supabase.functions.invoke(edgeFunction, {
        body: { locationIntegrationId: locIntegrations[0].id, action: "getSensors" },
      });
      const success = !fnError && data?.success;
      const newStatus = success ? "connected" : "disconnected";
      await updateIntegration(integration.id, {
        config: { ...config, connection_status: newStatus, last_tested_at: new Date().toISOString() },
      });
      setTestingId(null);
      refetch();
      if (success) {
        toast({ title: t("integrations.testSuccess" as any), description: t("integrations.connectionEstablished" as any) });
      } else {
        toast({ title: t("integrations.testFailed" as any), description: data?.error || `${gatewayLabel}`, variant: "destructive" });
      }
    } catch {
      await updateIntegration(integration.id, {
        config: { ...config, connection_status: "disconnected", last_tested_at: new Date().toISOString() },
      });
      setTestingId(null);
      refetch();
      toast({ title: t("integrations.testFailed" as any), variant: "destructive" });
    }
  };

  const getConnectionStatus = (integration: Integration): "connected" | "disconnected" => {
    const config = integration.config as { connection_status?: string } | null;
    return config?.connection_status === "connected" ? "connected" : "disconnected";
  };

  const integrationsByCategory = categories.map(category => ({
    category,
    integrations: integrations.filter(i => i.category === category.slug),
  })).filter(group => group.integrations.length > 0);

  const uncategorizedIntegrations = integrations.filter(i => !categories.some(c => c.slug === i.category));
  if (uncategorizedIntegrations.length > 0) {
    integrationsByCategory.push({
      category: { id: "uncategorized", tenant_id: "", name: t("integrations.uncategorized" as any), slug: "sonstige", description: null, sort_order: 999, created_at: "" },
      integrations: uncategorizedIntegrations,
    });
  }

  if (authLoading || roleLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-3 md:p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Plug className="h-6 w-6" />
              {t("integrations.title" as any)}
            </h1>
            <p className="text-muted-foreground mt-1">{t("integrations.subtitle" as any)}</p>
          </div>
        </header>

        <div className="p-3 md:p-6">
          <Tabs defaultValue="gateways">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="gateways" className="gap-2">
                <Server className="h-4 w-4" />
                Gateways
              </TabsTrigger>
              <TabsTrigger value="scanners" className="gap-2">
                <Smartphone className="h-4 w-4" />
                Mobile Scanner
              </TabsTrigger>
              <TabsTrigger value="api" className="gap-2">
                <Globe className="h-4 w-4" />
                API
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gateways">
              {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
              ) : integrations.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <div className="rounded-full bg-muted p-4 mb-4"><Server className="h-8 w-8 text-muted-foreground" /></div>
                    <p className="text-lg font-medium">{t("integrations.noIntegrations" as any)}</p>
                    <p className="text-muted-foreground text-center mt-1 max-w-md">
                      {t("integrations.createdInLocationHint" as any)}
                    </p>
                    <Button asChild variant="outline" className="mt-4">
                      <Link to="/locations">{t("integrations.goToLocations" as any)}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-8">
                  <Card className="bg-muted/30 border-dashed">
                    <CardContent className="py-3 px-4 text-sm text-muted-foreground">
                      {t("integrations.createdInLocationHint" as any)}
                    </CardContent>
                  </Card>
                  {integrationsByCategory.map(({ category, integrations }) => (
                    <div key={category.id}>
                      <h2 className="text-lg font-semibold mb-4">{category.name}</h2>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {integrations.map((integration) => (
                          <Card key={integration.id}>
                            <CardHeader className="pb-3">
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-primary/10"><Server className="h-5 w-5 text-primary" /></div>
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-lg truncate">{integration.name}</CardTitle>
                                  <div className="flex items-center gap-2 mt-1">
                                    {getConnectionStatus(integration) === "connected" ? (
                                      <Badge variant="success"><Wifi className="h-3 w-3 mr-1" />{t("integrations.connected" as any)}</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-muted-foreground"><WifiOff className="h-3 w-3 mr-1" />{t("integrations.notConnected" as any)}</Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                              {integration.description && <p className="text-sm text-muted-foreground mb-3">{integration.description}</p>}
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                                <span>{t("integrations.type" as any)}</span>
                                <code className="bg-muted px-1.5 py-0.5 rounded">{getGatewayDefinition(integration.type)?.label || integration.type}</code>
                              </div>
                              <Button variant="outline" size="sm" className="w-full" onClick={() => handleTestConnection(integration)} disabled={testingId === integration.id}>
                                {testingId === integration.id ? (
                                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("integrations.testingConnection" as any)}</>
                                ) : (
                                  <><Wifi className="mr-2 h-4 w-4" />{t("integrations.testConnection" as any)}</>
                                )}
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="scanners">
              <ScannerManagement />
            </TabsContent>

            <TabsContent value="api">
              <ApiSettings />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Integrations;
