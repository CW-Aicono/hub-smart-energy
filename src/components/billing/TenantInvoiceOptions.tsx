import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

const db = supabase as any;

/** Rechnungsangaben je Mandant: Eigenbedarf des Partners und Leitweg-ID für E-Rechnungen. */
export function TenantInvoiceOptions({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const T = (k: string) => t(`license.${k}` as any);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["tenant-invoice-options", tenantId],
    queryFn: async () => {
      const { data, error } = await db.from("tenants").select("partner_id, partner_self_customer, leitweg_id").eq("id", tenantId).maybeSingle();
      if (error) throw error;
      return data as { partner_id: string | null; partner_self_customer: boolean; leitweg_id: string | null } | null;
    },
  });
  const [self, setSelf] = useState(false);
  const [leitweg, setLeitweg] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) { setSelf(!!data.partner_self_customer); setLeitweg(data.leitweg_id ?? ""); } }, [data]);

  const save = async () => {
    setSaving(true);
    const { error } = await db.rpc("set_tenant_invoice_options", { p_tenant: tenantId, p_self: self, p_leitweg: leitweg });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(T("invoiceOptionsSaved"));
    qc.invalidateQueries({ queryKey: ["tenant-invoice-options", tenantId] });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{T("invoiceOptions")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {data?.partner_id && (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="self-customer">{T("selfCustomer")}</Label>
              <p className="text-xs text-muted-foreground">{T("selfCustomerHint")}</p>
            </div>
            <Switch id="self-customer" checked={self} onCheckedChange={setSelf} />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="leitweg">{T("leitwegId")}</Label>
          <Input id="leitweg" maxLength={60} value={leitweg} onChange={(e) => setLeitweg(e.target.value)} placeholder="z. B. 05515-12345-67" />
          <p className="text-xs text-muted-foreground">{T("leitwegHint")}</p>
        </div>
        <Button size="sm" disabled={saving} onClick={save}>{T("save")}</Button>
      </CardContent>
    </Card>
  );
}
