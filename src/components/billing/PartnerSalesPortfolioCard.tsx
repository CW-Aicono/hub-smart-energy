import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackageCheck, Lock, Plus } from "lucide-react";
import { packagePortfolioState, type PackageModuleLink } from "@/lib/partnerPortfolio";

const fmtEur = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** Zeigt dem Partner, welche Pakete AICONO ihm zum Verkauf freigegeben hat. */
export function PartnerSalesPortfolioCard({ partnerId }: { partnerId: string }) {
  const { data } = useQuery({
    queryKey: ["partner-sales-portfolio", partnerId],
    queryFn: async () => {
      const db = supabase as any;
      const [pm, pk, links, units] = await Promise.all([
        db.from("partner_modules").select("module_code").eq("partner_id", partnerId),
        db.from("pricing_packages").select("code,name,uvp,ek,always_active,active,sort").eq("active", true).order("sort"),
        db.from("pricing_package_modules").select("package_code,module_code"),
        db.from("pricing_unit_prices").select("code,name,uvp,ek,partner_available"),
      ]);
      for (const r of [pm, pk, links, units]) if (r.error) throw r.error;
      return {
        portfolio: (pm.data ?? []).map((r: any) => r.module_code as string),
        packages: pk.data as any[],
        links: links.data as PackageModuleLink[],
        units: (units.data ?? []) as any[],
      };
    },
  });
  if (!data) return null;
  const rows = data.packages.map((p) => ({
    ...p,
    state: p.always_active ? ("on" as const) : packagePortfolioState(p.code, data.links, data.portfolio),
  }));
  const extras = data.units.filter((u) => u.partner_available);
  const unlockedCount = rows.filter((r) => r.state === "on").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="h-4 w-4" /> Freigegeben zum Verkauf ({unlockedCount.toLocaleString("de-DE")} Pakete)
        </CardTitle>
        <Button asChild size="sm"><Link to="/partner/tenants"><Plus className="mr-1 h-4 w-4" />Endkunden anlegen</Link></Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Diese Pakete hat AICONO für dich freigeschaltet. Nur sie kannst du deinen Endkunden buchen. Weitere Pakete bitte bei AICONO anfragen.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((p) => (
            <div key={p.code} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {p.state !== "on" && <Lock className="h-3 w-3 text-muted-foreground" />}
                  {p.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.always_active ? "inklusive" : `EK ${fmtEur(Number(p.ek ?? 0))} · UVP ${fmtEur(Number(p.uvp ?? 0))} / Monat`}
                </div>
              </div>
              {p.state === "on" ? <Badge>Freigegeben</Badge>
                : p.state === "partial" ? <Badge variant="outline">Teilweise</Badge>
                : <Badge variant="secondary">Nicht freigegeben</Badge>}
            </div>
          ))}
          {extras.map((u) => (
            <div key={u.code} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-muted-foreground">EK {fmtEur(Number(u.ek ?? 0))} · UVP {fmtEur(Number(u.uvp ?? 0))}</div>
              </div>
              <Badge>Freigegeben</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
