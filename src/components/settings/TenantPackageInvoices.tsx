import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2, Lock, Package } from "lucide-react";
import { toast } from "sonner";
import { buildEInvoicePdf, downloadBlob } from "@/lib/eInvoicePdf";
import { customerInvoiceList, lockedHint, type CustomerInvoice } from "@/lib/tenantBillingView";

const db = supabase as any;
const modLabel = (c: string) => ALL_MODULES.find((m) => m.code === c)?.label ?? c;
const eur = (v: number) => Number(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const date = (d: string | null) => (d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("de-DE") : "–");

interface Summary {
  partner_name: string | null;
  package_billing: boolean;
  packages: { code: string; name: string; since: string | null; modules: string[] }[];
  locked: { module_code: string; package_code: string; package_name: string }[];
  sender: Record<string, any> | null;
}

/** Tenant-Admin: gebuchte Pakete (ohne Preise), gesperrte Funktionen und eigene Rechnungen zum Download. */
export function TenantPackageInvoices() {
  const { tenant } = useTenant();
  const { t } = useTranslation();
  const T = (k: string) => t(`tenantBilling.${k}` as any);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["tenant-package-summary", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await db.rpc("tenant_package_summary");
      if (error) throw error;
      return data as Summary;
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["tenant-own-invoices", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const [a, p] = await Promise.all([
        db.from("tenant_invoices").select("*").eq("tenant_id", tenant!.id).is("partner_id", null).not("issued_at", "is", null).order("issued_at", { ascending: false }),
        db.from("partner_customer_invoices").select("*").eq("tenant_id", tenant!.id).not("issued_at", "is", null).order("issued_at", { ascending: false }),
      ]);
      if (a.error) throw a.error;
      if (p.error) throw p.error;
      return customerInvoiceList(a.data ?? [], p.data ?? []);
    },
  });

  const download = async (inv: CustomerInvoice) => {
    setBusy(inv.id);
    try {
      const row = inv.row;
      let pdf;
      if (inv.source === "partner") {
        pdf = await buildEInvoicePdf({ settings: row.sender_snapshot, recipient: row.recipient_snapshot, invoice: row, partnerBranding: true } as any);
      } else {
        if (!summary?.sender) throw new Error(T("senderMissing"));
        const { data: tn } = await db.from("tenants").select("name, contact_person, street, house_number, address, postal_code, city, contact_email, leitweg_id").eq("id", row.tenant_id).maybeSingle();
        const recipient = {
          name: tn?.name ?? "Tenant", contact: tn?.contact_person ?? null,
          street: [tn?.street, tn?.house_number].filter(Boolean).join(" ") || tn?.address || null,
          postalCity: [tn?.postal_code, tn?.city].filter(Boolean).join(" ") || null,
          postalCode: tn?.postal_code ?? null, city: tn?.city ?? null, email: tn?.contact_email ?? null, leitwegId: tn?.leitweg_id ?? null,
        };
        const orig = row.cancels_invoice_id ? invoices.find((x) => x.id === row.cancels_invoice_id) : null;
        pdf = await buildEInvoicePdf({ settings: summary.sender as any, recipient, invoice: { ...row, cancels_number: orig?.number ?? null } } as any);
      }
      downloadBlob(pdf.blob, `${inv.number}.pdf`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  const requestTo = summary?.partner_name || "AICONO";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{T("packagesTitle")}</CardTitle>
          <CardDescription>{summary?.package_billing ? T("packagesDesc") : T("legacyDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(summary?.packages ?? []).length === 0 && <p className="text-sm text-muted-foreground">{T("noPackages")}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {(summary?.packages ?? []).map((p) => (
              <div key={p.code} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.since && <span className="text-xs text-muted-foreground">{T("since")} {date(p.since)}</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.modules.map((m) => <Badge key={m} variant="secondary" className="text-xs">{modLabel(m)}</Badge>)}
                </div>
              </div>
            ))}
          </div>
          {(summary?.locked ?? []).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{T("lockedTitle")}</h3>
              <ul className="grid gap-1 md:grid-cols-2 text-sm">
                {summary!.locked.map((l) => (
                  <li key={l.module_code} className="flex items-start gap-2 text-muted-foreground">
                    <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span><span className="text-foreground">{modLabel(l.module_code)}</span> – {lockedHint(l.package_name, requestTo, T("lockedHint"))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{T("invoicesTitle")}</CardTitle>
          <CardDescription>{T("invoicesDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow>
              <TableHead>{T("number")}</TableHead><TableHead>{T("from")}</TableHead><TableHead>{T("period")}</TableHead>
              <TableHead className="text-right">{T("amount")}</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {invoices.map((i) => (
                <TableRow key={`${i.source}-${i.id}`}>
                  <TableCell>{i.number}{i.cancellation && <div className="text-xs text-muted-foreground">{T("cancellation")}</div>}</TableCell>
                  <TableCell>{i.source === "partner" ? requestTo : "AICONO"}</TableCell>
                  <TableCell>{date(i.period_start)} – {date(i.period_end)}</TableCell>
                  <TableCell className="text-right">{eur(i.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => download(i)}>
                      {busy === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}<span className="ml-1">PDF</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{T("noInvoices")}</TableCell></TableRow>}
            </TableBody>
          </Table></div>
        </CardContent>
      </Card>
    </div>
  );
}
