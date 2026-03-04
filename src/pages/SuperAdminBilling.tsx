import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, Send, CheckCircle2, Loader2, ArrowUpDown, Pencil, Euro, AlertTriangle, Clock, FileCheck, RefreshCw } from "lucide-react";
import { generateSepaDirectDebitXml, downloadXml } from "@/lib/sepaXml";
import EditInvoiceContent from "@/components/super-admin/EditInvoiceContent";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type SortKey = "tenant" | "period" | "module" | "support" | "amount" | "payment" | "status" | "lexware";
type SortDir = "asc" | "desc";

const SuperAdminBilling = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();
  const [sepaOpen, setSepaOpen] = useState(false);
  const [creditor, setCreditor] = useState({ name: "", iban: "", bic: "", id: "" });
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [editInv, setEditInv] = useState<any>(null);
  const [editStatus, setEditStatus] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tenant");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const lexwareMutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      setSendingIds(new Set(invoiceIds));
      const { data, error } = await supabase.functions.invoke("lexware-api", {
        body: { action: "send-invoices", invoiceIds },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Unknown error");
      return data;
    },
    onSuccess: (data) => {
      const successes = data.results?.filter((r: any) => r.status === "success").length ?? 0;
      const errors = data.results?.filter((r: any) => r.status === "error") ?? [];
      const skipped = data.results?.filter((r: any) => r.status === "skipped").length ?? 0;
      if (successes > 0) toast.success(`${t("billing.lexware_success")} (${successes})`);
      if (skipped > 0) toast.info(`${skipped} bereits in Lexware`);
      if (errors.length > 0) errors.forEach((e: any) => toast.error(`${t("billing.lexware_error")}: ${e.reason}`));
      queryClient.invalidateQueries({ queryKey: ["super-admin-invoices"] });
    },
    onError: (err: Error) => toast.error(`${t("billing.lexware_error")}: ${err.message}`),
    onSettled: () => setSendingIds(new Set()),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, line_items, module_total, support_total, amount }: { id: string; status: string; line_items?: any[]; module_total?: number; support_total?: number; amount?: number }) => {
      const updates: any = { status };
      if (line_items !== undefined) { updates.line_items = line_items; updates.module_total = module_total; updates.support_total = support_total; updates.amount = amount; }
      const { error } = await supabase.from("tenant_invoices").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-invoices"] });
      toast.success("Abrechnung aktualisiert");
      setEditInv(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["super-admin-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenant_invoices").select("*, tenants(name, payment_method, sepa_iban, sepa_bic, sepa_account_holder, sepa_mandate_ref, sepa_mandate_date)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    const arr = [...invoices];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a: any, b: any) => {
      switch (sortKey) {
        case "tenant": return dir * (a.tenants?.name ?? "").localeCompare(b.tenants?.name ?? "");
        case "period": return dir * ((a.period_start ?? "").localeCompare(b.period_start ?? ""));
        case "module": return dir * (Number(a.module_total ?? 0) - Number(b.module_total ?? 0));
        case "support": return dir * (Number(a.support_total ?? 0) - Number(b.support_total ?? 0));
        case "amount": return dir * (Number(a.amount ?? 0) - Number(b.amount ?? 0));
        case "payment": return dir * ((a.tenants?.payment_method ?? "").localeCompare(b.tenants?.payment_method ?? ""));
        case "status": return dir * ((a.status ?? "").localeCompare(b.status ?? ""));
        case "lexware": {
          const aVal = a.lexware_invoice_id ? 1 : 0;
          const bVal = b.lexware_invoice_id ? 1 : 0;
          return dir * (aVal - bVal);
        }
        default: return 0;
      }
    });
    return arr;
  }, [invoices, sortKey, sortDir]);

  // Summary stats
  const stats = useMemo(() => {
    const open = invoices.filter((i: any) => i.status === "draft" || i.status === "sent");
    const paid = invoices.filter((i: any) => i.status === "paid");
    const overdue = invoices.filter((i: any) => i.status === "overdue");
    const inLexware = invoices.filter((i: any) => !!i.lexware_invoice_id);
    return {
      openAmount: open.reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0),
      openCount: open.length,
      paidAmount: paid.reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0),
      paidCount: paid.length,
      overdueAmount: overdue.reduce((s: number, i: any) => s + Number(i.amount ?? 0), 0),
      overdueCount: overdue.length,
      lexwareCount: inLexware.length,
      totalCount: invoices.length,
    };
  }, [invoices]);

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const statusLabel = (s: string) => {
    switch (s) { case "draft": return "Entwurf"; case "sent": return "Gesendet"; case "paid": return "Bezahlt"; case "overdue": return "Überfällig"; case "voided": return "Storniert"; default: return s; }
  };

  const statusBadgeVariant = (s: string): "default" | "secondary" | "destructive" | "success" | "outline" => {
    switch (s) { case "paid": return "success"; case "overdue": return "destructive"; case "sent": return "default"; case "voided": return "outline"; default: return "secondary"; }
  };

  const handleSyncStatus = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("lexware-sync-status");
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["super-admin-invoices"] });
      toast.success(`Status synchronisiert (${data?.updated ?? 0} aktualisiert)`);
    } catch (err: any) {
      toast.error(`Sync fehlgeschlagen: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleSepaExport = () => {
    if (!creditor.name || !creditor.iban || !creditor.bic || !creditor.id) {
      toast.error(t("billing.sepa_creditor_missing"));
      return;
    }
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
      msgId, creditorName: creditor.name, creditorIban: creditor.iban, creditorBic: creditor.bic, creditorId: creditor.id, collectionDate,
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

  const SortableHead = ({ label, sortId }: { label: string; sortId: SortKey }) => (
    <TableHead>
      <button onClick={() => toggleSort(sortId)} className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === sortId ? "text-foreground" : "text-muted-foreground/50"}`} />
      </button>
    </TableHead>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("billing.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={syncing} onClick={handleSyncStatus}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Status aktualisieren
            </Button>
            <Button variant="outline" disabled={lexwareMutation.isPending} onClick={() => {
              const openIds = invoices.filter((inv: any) => !inv.lexware_invoice_id && (inv.status === "draft" || inv.status === "sent")).map((inv: any) => inv.id);
              if (openIds.length === 0) { toast.info(t("billing.lexware_no_open")); return; }
              lexwareMutation.mutate(openIds);
            }}>
              {lexwareMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {t("billing.lexware_send_all")}
            </Button>
            <Dialog open={sepaOpen} onOpenChange={setSepaOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Download className="h-4 w-4 mr-2" />{t("billing.sepa_export")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("billing.sepa_export")}</DialogTitle>
                  <DialogDescription>Gläubiger-Daten eingeben und SEPA pain.008 XML-Datei erzeugen.</DialogDescription>
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
                  <Button onClick={handleSepaExport}><Download className="h-4 w-4 mr-2" />XML exportieren</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="rounded-lg bg-accent p-2.5"><Clock className="h-5 w-5 text-accent-foreground" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Offene Beträge</p>
                  <p className="text-2xl font-bold">{stats.openAmount.toFixed(2)} €</p>
                  <p className="text-xs text-muted-foreground">{stats.openCount} Rechnungen</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="rounded-lg bg-secondary p-2.5"><Euro className="h-5 w-5 text-secondary-foreground" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Bezahlt</p>
                  <p className="text-2xl font-bold">{stats.paidAmount.toFixed(2)} €</p>
                  <p className="text-xs text-muted-foreground">{stats.paidCount} Rechnungen</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="rounded-lg bg-destructive/10 p-2.5"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">Überfällig</p>
                  <p className="text-2xl font-bold">{stats.overdueAmount.toFixed(2)} €</p>
                  <p className="text-xs text-muted-foreground">{stats.overdueCount} Rechnungen</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 p-2.5"><FileCheck className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-sm text-muted-foreground">In Lexware</p>
                  <p className="text-2xl font-bold">{stats.lexwareCount} / {stats.totalCount}</p>
                  <p className="text-xs text-muted-foreground">synchronisiert</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label={t("billing.tenant")} sortId="tenant" />
                    <SortableHead label={t("billing.period")} sortId="period" />
                    <SortableHead label="Module" sortId="module" />
                    <SortableHead label="Support" sortId="support" />
                    <SortableHead label={t("billing.amount")} sortId="amount" />
                    <SortableHead label={t("billing.payment_method")} sortId="payment" />
                    <SortableHead label="Status" sortId="status" />
                    <TableHead className="text-center">Bearbeiten</TableHead>
                    <SortableHead label="Lexware" sortId="lexware" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{t("billing.no_invoices")}</TableCell></TableRow>
                  ) : (
                    sorted.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.tenants?.name ?? "–"}</TableCell>
                        <TableCell className="text-muted-foreground">{inv.period_start ? new Date(inv.period_start + "T00:00:00").toLocaleDateString("de-DE") : "–"} – {inv.period_end ? new Date(inv.period_end + "T00:00:00").toLocaleDateString("de-DE") : "–"}</TableCell>
                        <TableCell>{Number(inv.module_total ?? 0).toFixed(2)} €</TableCell>
                        <TableCell>{Number(inv.support_total ?? 0).toFixed(2)} €</TableCell>
                        <TableCell className="font-medium">{Number(inv.amount).toFixed(2)} €</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {inv.tenants?.payment_method === "sepa" ? "SEPA" : "Rechnung"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(inv.status)} className="text-xs">
                            {statusLabel(inv.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="ghost" onClick={() => { setEditInv(inv); setEditStatus(inv.status); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell>
                          {inv.lexware_invoice_id ? (
                            <Badge variant="default" className="text-xs gap-1">
                              <CheckCircle2 className="h-3 w-3" />{t("billing.lexware_synced")}
                            </Badge>
                          ) : inv.status === "voided" ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">—</Badge>
                          ) : (
                            <Button size="sm" variant="ghost" disabled={sendingIds.has(inv.id) || lexwareMutation.isPending} onClick={() => lexwareMutation.mutate([inv.id])}>
                              {sendingIds.has(inv.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Edit Invoice Dialog */}
        <Dialog open={!!editInv} onOpenChange={(o) => { if (!o) setEditInv(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Abrechnung bearbeiten</DialogTitle>
              <DialogDescription>{editInv?.tenants?.name} — {editInv?.period_start} – {editInv?.period_end}</DialogDescription>
            </DialogHeader>
            {editInv && <EditInvoiceContent
              invoice={editInv}
              editStatus={editStatus}
              setEditStatus={setEditStatus}
              onSave={(updates) => {
                statusMutation.mutate({ id: editInv.id, status: editStatus, ...updates });
              }}
              onCancel={() => setEditInv(null)}
              isPending={statusMutation.isPending}
            />}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default SuperAdminBilling;
