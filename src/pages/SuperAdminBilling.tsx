import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SuperAdminBilling = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["super-admin-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_invoices")
        .select("*, tenants(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["super-admin-licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_licenses")
        .select("*, tenants(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Laden...</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const statusColor = (s: string) => {
    switch (s) {
      case "paid": return "default";
      case "sent": return "secondary";
      case "overdue": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">Abrechnung</h1>
          <p className="text-sm text-muted-foreground mt-1">Lizenzen und Rechnungen verwalten</p>
        </header>
        <div className="p-6 space-y-6">
          <Card>
            <CardHeader><CardTitle>Aktive Lizenzen</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mandant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Preis/Monat</TableHead>
                    <TableHead>Zyklus</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {licenses.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Keine Lizenzen</TableCell></TableRow>
                  ) : (
                    licenses.map((lic: any) => (
                      <TableRow key={lic.id}>
                        <TableCell className="font-medium">{lic.tenants?.name ?? "–"}</TableCell>
                        <TableCell>{lic.plan_name}</TableCell>
                        <TableCell>{lic.price_monthly} €</TableCell>
                        <TableCell>{lic.billing_cycle === "monthly" ? "Monatlich" : "Jährlich"}</TableCell>
                        <TableCell><Badge variant={lic.status === "active" ? "default" : "destructive"}>{lic.status}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Rechnungen</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr.</TableHead>
                    <TableHead>Mandant</TableHead>
                    <TableHead>Zeitraum</TableHead>
                    <TableHead>Betrag</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Keine Rechnungen</TableCell></TableRow>
                  ) : (
                    invoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell>{inv.tenants?.name ?? "–"}</TableCell>
                        <TableCell className="text-muted-foreground">{inv.period_start} – {inv.period_end}</TableCell>
                        <TableCell>{inv.amount} €</TableCell>
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
