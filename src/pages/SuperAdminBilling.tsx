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

const SuperAdminBilling = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();

  const { data: invoices = [] } = useQuery({
    queryKey: ["super-admin-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenant_invoices").select("*, tenants(name)").order("created_at", { ascending: false });
      if (error) throw error;
      // Sort by tenant name alphabetically, then by date descending
      return (data ?? []).sort((a: any, b: any) => {
        const nameA = (a.tenants?.name ?? "").toLowerCase();
        const nameB = (b.tenants?.name ?? "").toLowerCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["super-admin-licenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenant_licenses").select("*, tenants(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const statusColor = (s: string) => {
    switch (s) { case "paid": return "default"; case "sent": return "secondary"; case "overdue": return "destructive"; default: return "outline"; }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("billing.subtitle")}</p>
        </header>
        <div className="p-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("billing.active_licenses")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("billing.tenant")}</TableHead>
                    <TableHead>{t("billing.plan")}</TableHead>
                    <TableHead>{t("billing.price_month")}</TableHead>
                    <TableHead>{t("billing.cycle")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {licenses.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t("billing.no_licenses")}</TableCell></TableRow>
                  ) : (
                    licenses.map((lic: any) => (
                      <TableRow key={lic.id}>
                        <TableCell className="font-medium">{lic.tenants?.name ?? "–"}</TableCell>
                        <TableCell>{lic.plan_name}</TableCell>
                        <TableCell>{lic.price_monthly} €</TableCell>
                        <TableCell>{lic.billing_cycle === "monthly" ? t("billing.monthly") : t("billing.yearly")}</TableCell>
                        <TableCell><Badge variant={lic.status === "active" ? "default" : "destructive"}>{lic.status}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t("billing.invoices")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("billing.invoice_number")}</TableHead>
                    <TableHead>{t("billing.tenant")}</TableHead>
                    <TableHead>{t("billing.period")}</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Support</TableHead>
                    <TableHead>{t("billing.amount")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("billing.no_invoices")}</TableCell></TableRow>
                  ) : (
                    invoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell>{inv.tenants?.name ?? "–"}</TableCell>
                        <TableCell className="text-muted-foreground">{inv.period_start} – {inv.period_end}</TableCell>
                        <TableCell>{Number(inv.module_total ?? 0).toFixed(2)} €</TableCell>
                        <TableCell>{Number(inv.support_total ?? 0).toFixed(2)} €</TableCell>
                        <TableCell className="font-medium">{Number(inv.amount).toFixed(2)} €</TableCell>
                        <TableCell><Badge variant={statusColor(inv.status) as any}>{inv.status}</Badge></TableCell>
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

export default SuperAdminBilling;
