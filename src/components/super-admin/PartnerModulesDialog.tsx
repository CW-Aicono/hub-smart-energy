import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { ALL_MODULES } from "@/hooks/useTenantModules";
import { packageModules, packagePortfolioState, modulesToRevoke, type PackageModuleLink } from "@/lib/partnerPortfolio";
import { toast } from "sonner";

interface Props {
  partnerId: string | null;
  partnerName?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const TIMEOUT_MS = 15000;
const db = supabase as any;

async function setModule(partnerId: string, code: string, on: boolean) {
  const call = supabase.functions.invoke("super-admin-set-partner-module", { body: { partner_id: partnerId, module_code: code, enabled: on } });
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Keine Antwort vom Server (Zeitüberschreitung).")), TIMEOUT_MS));
  const { data, error } = await Promise.race([call, timeout]);
  if (error || data?.error || data?.success !== true) {
    let msg = data?.error ?? error?.message ?? "Unerwartete Antwort vom Server";
    try { msg = (await (error as any)?.context?.json())?.error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }
}

/** Portal-Admin schaltet Pakete für einen Partner frei; im Hintergrund werden die Paketmodule ins Partner-Portfolio übernommen. */
export function PartnerModulesDialog({ partnerId, partnerName, open, onOpenChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<string[]>([]);
  const { data, error: loadError, refetch } = useQuery({
    queryKey: ["partner-portfolio-admin", partnerId],
    enabled: open && !!partnerId,
    queryFn: async () => {
      const [pm, pk, links] = await Promise.all([
        db.from("partner_modules").select("module_code").eq("partner_id", partnerId!),
        db.from("pricing_packages").select("code,name,always_active,active,sort").eq("active", true).order("sort"),
        db.from("pricing_package_modules").select("package_code,module_code"),
      ]);
      for (const r of [pm, pk, links]) if (r.error) throw r.error;
      return {
        codes: (pm.data ?? []).map((r: any) => r.module_code as string),
        packages: (pk.data ?? []).filter((p: any) => !p.always_active) as { code: string; name: string }[],
        links: (links.data ?? []) as PackageModuleLink[],
      };
    },
  });
  useEffect(() => { if (data) setLocal(data.codes); }, [data]);

  const run = async (key: string, changes: { code: string; on: boolean }[]) => {
    if (!partnerId) return;
    setBusy(key);
    try {
      for (const c of changes) await setModule(partnerId, c.code, c.on);
    } catch (e) {
      toast.error("Speichern fehlgeschlagen: " + (e as Error).message);
    } finally {
      setBusy(null);
      refetch();
    }
  };

  const togglePackage = async (code: string, on: boolean) => {
    if (!data) return;
    if (on) {
      const missing = packageModules(code, data.links).filter((m) => !local.includes(m));
      await run(code, missing.map((m) => ({ code: m, on: true })));
    } else {
      const { count } = await db.from("tenant_package_bookings").select("id, tenants!inner(partner_id)", { count: "exact", head: true })
        .eq("package_code", code).is("cancelled_at", null).eq("tenants.partner_id", partnerId);
      if ((count ?? 0) > 0 && !window.confirm(`${count} Tenant(n) dieses Partners haben das Paket gebucht. Bestehende Buchungen bleiben, neue Buchungen sind dann gesperrt. Trotzdem entziehen?`)) return;
      await run(code, modulesToRevoke(code, data.links, local).map((m) => ({ code: m, on: false })));
    }
  };

  const remoteOn = local.includes("remote_support");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paket-Portfolio für {partnerName ?? "Partner"}</DialogTitle>
          <DialogDescription>
            Nur hier freigeschaltete Pakete kann der Partner seinen Tenants verkaufen. Das Basispaket ist immer enthalten.
          </DialogDescription>
        </DialogHeader>
        {loadError && <p className="text-sm text-destructive">Portfolio konnte nicht geladen werden: {(loadError as Error).message}</p>}
        <div className="divide-y">
          {(data?.packages ?? []).map((p) => {
            const st = packagePortfolioState(p.code, data!.links, local);
            return (
              <div key={p.code} className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm flex items-center gap-2">{p.name}{st === "partial" && <Badge variant="outline">teilweise</Badge>}</span>
                <Switch checked={st === "on"} disabled={!!busy} aria-label={p.name} onCheckedChange={(v) => togglePackage(p.code, v)} />
              </div>
            );
          })}
          {ALL_MODULES.some((m) => m.code === "remote_support") && (
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm">Zusatzleistung: Remote-Support</span>
              <Switch checked={remoteOn} disabled={!!busy} aria-label="Remote-Support" onCheckedChange={(v) => run("remote_support", [{ code: "remote_support", on: v }])} />
            </div>
          )}
        </div>
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground mt-2"><ChevronDown className="h-4 w-4" /> Einzelmodule (Experten)</CollapsibleTrigger>
          <CollapsibleContent className="divide-y mt-2">
            {ALL_MODULES.filter((m) => !(m as any).alwaysOn).map((m) => (
              <div key={m.code} className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm">{m.label}</span>
                <Switch checked={local.includes(m.code)} disabled={!!busy} onCheckedChange={(v) => run(m.code, [{ code: m.code, on: v }])} />
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </DialogContent>
    </Dialog>
  );
}

export default PartnerModulesDialog;
