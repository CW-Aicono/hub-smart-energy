import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { suggestPackages } from "@/lib/packageSuggestion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
const db = supabase as any;

export function usePackageBilling(tenantId: string) {
  return useQuery({ queryKey: ["tenant-package-billing", tenantId], queryFn: async () => {
    const { data, error } = await db.from("tenants").select("package_billing, package_billing_from").eq("id", tenantId).maybeSingle();
    if (error) throw error;
    return data as { package_billing: boolean; package_billing_from: string | null } | null;
  } });
}

/** Schalter „Abrechnung nach Paketen“ je Tenant (nur AICONO-Portal). */
export function PackageBillingSwitch({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation(); const T = (k: string) => t(`license.${k}` as any);
  const qc = useQueryClient();
  const { data: state } = usePackageBilling(tenantId);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const { data: proposal } = useQuery({ queryKey: ["package-billing-proposal", tenantId], enabled: open, queryFn: async () => {
    const [defs, mods, tms, cps] = await Promise.all([
      db.from("pricing_packages").select("code,name,uvp,requires_package,requires_any_other,always_active").eq("active", true).order("sort"),
      db.from("pricing_package_modules").select("package_code,module_code"),
      db.from("tenant_modules").select("module_code").eq("tenant_id", tenantId).eq("is_enabled", true),
      db.from("charge_points").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]);
    for (const r of [defs, mods, tms]) if (r.error) throw r.error;
    const list = (defs.data ?? []).map((d: any) => ({ ...d, uvp: Number(d.uvp), modules: (mods.data ?? []).filter((m: any) => m.package_code === d.code).map((m: any) => m.module_code) }));
    const active = (tms.data ?? []).map((m: any) => m.module_code as string);
    const s = suggestPackages(active, list, (cps.count ?? 0) > 0);
    return { active, ...s, names: Object.fromEntries(list.map((d: any) => [d.code, d.name])) as Record<string, string> };
  } });
  const set = async (enabled: boolean, individual: string[] = []) => {
    setBusy(true);
    const { error } = await db.rpc("set_tenant_package_billing", { p_tenant: tenantId, p_enabled: enabled, p_individual: individual });
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tenant-package-billing", tenantId] });
    setOpen(false);
  };
  const on = !!state?.package_billing;
  const from = state?.package_billing_from ? new Date(state.package_billing_from + "T00:00:00").toLocaleDateString("de-DE") : "";
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" />{T("pkgBilling")}</CardTitle>
      <CardDescription>{on ? T("pkgBillingOn").replace("{date}", from) : T("pkgBillingOff")}</CardDescription></CardHeader>
    <CardContent><div className="flex items-center gap-3"><Switch checked={on} disabled={busy} aria-label={T("pkgBilling")} onCheckedChange={v => { if (v) setOpen(true); else if (window.confirm(T("switchBack"))) set(false); }} /><span className="text-sm">{on ? T("pkgBilling") : T("pkgBillingOff")}</span></div></CardContent>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{T("switchTitle")}</DialogTitle></DialogHeader>
      {!proposal ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="space-y-4 text-sm">
        <div><p className="font-medium mb-1">{T("activeModules")}</p><div className="flex flex-wrap gap-1">{proposal.active.map(m => <Badge key={m} variant="secondary">{m}</Badge>)}</div></div>
        <div><p className="font-medium mb-1">{T("suggestion")}</p><div className="flex flex-wrap gap-1">{proposal.packages.length ? proposal.packages.map(c => <Badge key={c}>{proposal.names[c] ?? c}</Badge>) : "—"}</div></div>
        {proposal.automatic.length > 0 && <div><p className="font-medium mb-1">{T("automaticModules")}</p><div className="flex flex-wrap gap-1">{proposal.automatic.map(m => <Badge key={m} variant="outline">{m}</Badge>)}</div></div>}
        <div><p className="font-medium mb-1">{T("individualGrants")}</p><div className="flex flex-wrap gap-1">{proposal.individual.length ? proposal.individual.map(m => <Badge key={m} variant="outline">{m}</Badge>) : "—"}</div></div>
        <p className="text-muted-foreground">{T("switchNote")}</p>
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{T("cancel")}</Button><Button disabled={busy || !proposal} onClick={() => set(true, proposal?.individual ?? [])}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{T("switchConfirm")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </Card>;
}
