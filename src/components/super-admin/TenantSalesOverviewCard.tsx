import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, PlugZap } from "lucide-react";

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** AICONO-Sicht auf einen Endkunden: wer verkauft, was wurde verkauft, wie viele Ladepunkte sind aktiv und neu. */
export function TenantSalesOverviewCard({ tenantId }: { tenantId: string }) {
  const { data } = useQuery({
    queryKey: ["sa-tenant-sales-overview", tenantId],
    queryFn: async () => {
      const db = supabase as any;
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [t, sales, cps, bookings] = await Promise.all([
        db.from("tenants").select("partner_id, partners(name, billing_mode)").eq("id", tenantId).single(),
        db.from("license_sales").select("id,label,product_kind,quantity,cadence,sale_price,purchase_price,starts_on,ended_on,created_at,partner_id").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
        db.from("charge_points").select("id,created_at").eq("tenant_id", tenantId),
        db.from("tenant_package_bookings").select("package_code,created_at").eq("tenant_id", tenantId).is("cancelled_at", null),
      ]);
      for (const r of [t, sales, cps, bookings]) if (r.error) throw r.error;
      const cpList = cps.data ?? [];
      return {
        partner: t.data?.partners as { name: string; billing_mode: string } | null,
        sales: (sales.data ?? []) as any[],
        cpTotal: cpList.length,
        cpNew: cpList.filter((c: any) => new Date(c.created_at) >= monthStart).length,
        bookings: (bookings.data ?? []) as any[],
      };
    },
  });
  if (!data) return null;
  const active = data.sales.filter((s) => !s.ended_on);
  const saleSum = active.reduce((s, x) => s + Number(x.sale_price) * Number(x.quantity), 0);
  const ekSum = active.reduce((s, x) => s + Number(x.purchase_price ?? 0) * Number(x.quantity), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4" />Verkauf & Nutzung im Überblick</CardTitle>
        <CardDescription>
          {data.partner ? <>Betreut von <Badge variant="secondary">{data.partner.name}</Badge> ({data.partner.billing_mode === "commission" ? "Provision" : "Wiederverkauf"})</> : <>Direktkunde von AICONO</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Aktive Verträge</p><p className="text-xl font-bold">{active.length.toLocaleString("de-DE")}</p></div>
          <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Verkaufspreis an Kunde / EK AICONO</p><p className="text-xl font-bold">{eur(saleSum)} / {eur(ekSum)}</p></div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><PlugZap className="h-3 w-3" />Ladepunkte (werden automatisch abgerechnet)</p>
            <p className="text-xl font-bold">{data.cpTotal.toLocaleString("de-DE")}</p>
            {data.cpNew > 0 && <Badge className="mt-1 bg-warning text-warning-foreground hover:bg-warning">+{data.cpNew.toLocaleString("de-DE")} neu in diesem Monat</Badge>}
          </div>
        </div>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Verkauft am</TableHead><TableHead>Produkt</TableHead><TableHead className="text-right">Menge</TableHead><TableHead className="text-right">Preis Kunde</TableHead><TableHead className="text-right">EK AICONO</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.sales.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{new Date(s.created_at).toLocaleDateString("de-DE")}</TableCell>
                <TableCell>{s.label}{s.partner_id ? <Badge variant="outline" className="ml-2 text-xs">durch Partner</Badge> : null}</TableCell>
                <TableCell className="text-right">{Number(s.quantity).toLocaleString("de-DE")}</TableCell>
                <TableCell className="text-right">{eur(Number(s.sale_price))}</TableCell>
                <TableCell className="text-right">{s.purchase_price != null ? eur(Number(s.purchase_price)) : "–"}</TableCell>
                <TableCell>{s.ended_on ? <Badge variant="secondary">beendet</Badge> : <Badge>aktiv</Badge>}</TableCell>
              </TableRow>
            ))}
            {data.bookings.map((b) => (
              <TableRow key={b.package_code}>
                <TableCell>{new Date(b.created_at).toLocaleDateString("de-DE")}</TableCell>
                <TableCell>{b.package_code} <Badge variant="outline" className="ml-2 text-xs">Paketbuchung</Badge></TableCell>
                <TableCell className="text-right">1</TableCell><TableCell className="text-right">Katalog</TableCell><TableCell className="text-right">Katalog</TableCell>
                <TableCell><Badge>aktiv</Badge></TableCell>
              </TableRow>
            ))}
            {!data.sales.length && !data.bookings.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Noch nichts verkauft.</TableCell></TableRow>}
          </TableBody>
        </Table></div>
      </CardContent>
    </Card>
  );
}
