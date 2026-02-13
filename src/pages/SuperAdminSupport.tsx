import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SuperAdminSupport = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();

  const { data: sessions = [] } = useQuery({
    queryKey: ["support-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_sessions").select("*, tenants(name)").order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">{t("support.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("support.subtitle")}</p>
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
                    <TableHead>{t("support.start")}</TableHead>
                    <TableHead>{t("support.end")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">{t("support.no_sessions")}</TableCell></TableRow>
                  ) : (
                    sessions.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.tenants?.name ?? "–"}</TableCell>
                        <TableCell>{s.reason ?? "–"}</TableCell>
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
