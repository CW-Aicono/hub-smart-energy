import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download } from "lucide-react";
import { generateSepaDirectDebitXml, downloadXml } from "@/lib/sepaXml";
import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SuperAdminBilling = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();
  const [sepaOpen, setSepaOpen] = useState(false);
  const [creditor, setCreditor] = useState({ name: "", iban: "", bic: "", id: "" });

  const { data: invoices = [] } = useQuery({
    queryKey: ["super-admin-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenant_invoices").select("*, tenants(name, payment_method, sepa_iban, sepa_bic, sepa_account_holder, sepa_mandate_ref, sepa_mandate_date)").order("created_at", { ascending: false });
      if (error) throw error;
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

  const handleSepaExport = () => {
    if (!creditor.name || !creditor.iban || !creditor.bic || !creditor.id) {
      toast.error(t("billing.sepa_creditor_missing"));
      return;
    }

    // Find open invoices for SEPA tenants
    const sepaInvoices = invoices.filter((inv: any) =>
      (inv.tenants?.payment_method === "sepa") &&
      (inv.status === "draft" || inv.status === "sent") &&
      Number(inv.amount) > 0 &&
      inv.tenants?.sepa_iban &&
      inv.tenants?.sepa_mandate_ref
    );

    if (sepaInvoices.length === 0) {
      toast.error(t("billing.sepa_no_debit_tenants"));
      return;
    }

    const now = new Date();
    const collectionDate = new Date(now.getTime() + 5 * 86400000).toISOString().split("T")[0];
    const msgId = `SEPA-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;

    const xml = generateSepaDirectDebitXml({
      msgId,
      creditorName: creditor.name,
      creditorIban: creditor.iban,
      creditorBic: creditor.bic,
      creditorId: creditor.id,
      collectionDate,
      payments: sepaInvoices.map((inv: any) => ({
        endToEndId: inv.invoice_number || inv.id.slice(0, 35),
        amount: Number(inv.amount),
        mandateRef: inv.tenants.sepa_mandate_ref,
        mandateDate: inv.tenants.sepa_mandate_date || "2024-01-01",
        debtorName: inv.tenants.sepa_account_holder || inv.tenants.name,
        debtorIban: inv.tenants.sepa_iban,
        debtorBic: inv.tenants.sepa_bic || "",
        remittanceInfo: `${inv.invoice_number ?? "Rechnung"} ${inv.period_start ?? ""} - ${inv.period_end ?? ""}`.trim(),
      })),
    });

    downloadXml(xml, `SEPA-Lastschrift-${now.toISOString().split("T")[0]}.xml`);
    toast.success(`${t("billing.sepa_exported")} (${sepaInvoices.length} Positionen)`);
    setSepaOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("billing.subtitle")}</p>
          </div>
          <Dialog open={sepaOpen} onOpenChange={setSepaOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                {t("billing.sepa_export")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("billing.sepa_export")}</DialogTitle>
                <DialogDescription>
                  Gläubiger-Daten eingeben und SEPA pain.008 XML-Datei erzeugen.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Gläubiger-Name</Label>
                  <Input value={creditor.name} onChange={(e) => setCreditor(c => ({ ...c, name: e.target.value }))} placeholder="Ihre Firma GmbH" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>IBAN</Label>
                    <Input value={creditor.iban} onChange={(e) => setCreditor(c => ({ ...c, iban: e.target.value }))} placeholder="DE89 3704 0044 0532 0130 00" />
                  </div>
                  <div className="space-y-2">
                    <Label>BIC</Label>
                    <Input value={creditor.bic} onChange={(e) => setCreditor(c => ({ ...c, bic: e.target.value }))} placeholder="COBADEFFXXX" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Gläubiger-ID</Label>
                  <Input value={creditor.id} onChange={(e) => setCreditor(c => ({ ...c, id: e.target.value }))} placeholder="DE98ZZZ09999999999" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSepaOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={handleSepaExport}>
                  <Download className="h-4 w-4 mr-2" />
                  XML exportieren
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
                    <TableHead>{t("billing.payment_method")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("billing.no_invoices")}</TableCell></TableRow>
                  ) : (
                    invoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell>{inv.tenants?.name ?? "–"}</TableCell>
                        <TableCell className="text-muted-foreground">{inv.period_start} – {inv.period_end}</TableCell>
                        <TableCell>{Number(inv.module_total ?? 0).toFixed(2)} €</TableCell>
                        <TableCell>{Number(inv.support_total ?? 0).toFixed(2)} €</TableCell>
                        <TableCell className="font-medium">{Number(inv.amount).toFixed(2)} €</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {inv.tenants?.payment_method === "sepa" ? "SEPA" : "Rechnung"}
                          </Badge>
                        </TableCell>
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
