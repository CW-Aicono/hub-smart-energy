import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CreateSupportEntryDialog from "@/components/super-admin/CreateSupportEntryDialog";

const SuperAdminSupport = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();

  const { data: sessions = [] } = useQuery({
    queryKey: ["support-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_sessions")
        .select("*, tenants(name)")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Check which tenants have remote_support flatrate
  const { data: flatrateTenants = [] } = useQuery({
    queryKey: ["flatrate-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_modules")
        .select("tenant_id")
        .eq("module_code", "remote_support")
        .eq("is_enabled", true);
      if (error) throw error;
      return (data ?? []).map((d: any) => d.tenant_id);
    },
  });

  const flatrateSet = new Set(flatrateTenants);

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const formatDuration = (s: any) => {
    if (s.duration_minutes) return `${s.duration_minutes} Min.`;
    if (!s.ended_at) return "–";
    const mins = Math.max(1, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000));
    return `${mins} Min.`;
  };

  const calcBlocks = (s: any) => {
    const mins = s.duration_minutes ?? Math.max(1, Math.round((new Date(s.ended_at ?? s.expires_at).getTime() - new Date(s.started_at).getTime()) / 60000));
    return Math.ceil(mins / 15);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("support.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("support.subtitle")}</p>
          </div>
          <CreateSupportEntryDialog />
        </header>
        <div className="p-6">
          <Card>
            <CardHeader><CardTitle>{t("support.log")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("billing.tenant")}</TableHead>
                    <TableHead>{t("support.reason")}</TableHead>
                    <TableHead>Dauer</TableHead>
                    <TableHead>Blöcke (15 Min.)</TableHead>
                    <TableHead>Flatrate</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>{t("support.start")}</TableHead>
                    <TableHead>{t("support.end")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("support.no_sessions")}</TableCell></TableRow>
                  ) : (
                    sessions.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.tenants?.name ?? "–"}</TableCell>
                        <TableCell>{s.reason ?? "–"}</TableCell>
                        <TableCell>{formatDuration(s)}</TableCell>
                        <TableCell>{s.ended_at ? calcBlocks(s) : "–"}</TableCell>
                        <TableCell>
                          {flatrateSet.has(s.tenant_id) ? (
                            <Badge variant="secondary">Flatrate</Badge>
                          ) : (
                            <Badge variant="outline">Abrechnung</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.is_manual ? (
                            <Badge variant="outline" className="text-xs">Manuell</Badge>
                          ) : (
                            <Badge variant="default" className="text-xs">Auto</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{new Date(s.started_at).toLocaleString("de-DE")}</TableCell>
                        <TableCell className="text-muted-foreground">{s.ended_at ? new Date(s.ended_at).toLocaleString("de-DE") : t("common.active")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminSupport;
