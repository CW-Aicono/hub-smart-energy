import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Euro, ExternalLink } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Row {
  contract_id: string;
  tenant_id: string;
  tenant_name: string;
  status: string;
  baseline_year: number;
  aicono_share_pct: number;
  latest_year: number | null;
  latest_status: string | null;
  total_savings_eur: number;
  aicono_amount_eur: number;
}

export default function SuperAdminSavingsShare() {
  const query = useQuery({
    queryKey: ["super-admin-savings-share-overview"],
    queryFn: async () => {
      // Only tenants with gain_sharing enabled
      const { data: mods } = await supabase
        .from("tenant_modules")
        .select("tenant_id, is_enabled")
        .eq("module_code", "gain_sharing")
        .eq("is_enabled", true);
      const enabledTenantIds = new Set((mods ?? []).map((m: any) => m.tenant_id));

      const { data: contracts, error } = await supabase
        .from("tenant_savings_contracts" as any)
        .select("id, tenant_id, status, baseline_year, aicono_share_pct")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const filtered = (contracts as any[] ?? []).filter(c => enabledTenantIds.has(c.tenant_id));
      const tenantIds = [...new Set(filtered.map(c => c.tenant_id))];
      if (tenantIds.length === 0) return [] as Row[];

      const { data: tenants } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
      const tenantMap = new Map((tenants ?? []).map((t: any) => [t.id, t.name]));

      const contractIds = filtered.map(c => c.id);
      const { data: settlements } = await supabase
        .from("tenant_savings_settlements" as any)
        .select("contract_id, period_year, status, total_savings_eur, aicono_amount_eur")
        .in("contract_id", contractIds)
        .order("period_year", { ascending: false });

      const latestByContract = new Map<string, any>();
      for (const s of (settlements as any[] ?? [])) {
        if (!latestByContract.has(s.contract_id)) latestByContract.set(s.contract_id, s);
      }

      return filtered.map<Row>(c => {
        const s = latestByContract.get(c.id);
        return {
          contract_id: c.id,
          tenant_id: c.tenant_id,
          tenant_name: tenantMap.get(c.tenant_id) ?? "–",
          status: c.status,
          baseline_year: c.baseline_year,
          aicono_share_pct: Number(c.aicono_share_pct),
          latest_year: s?.period_year ?? null,
          latest_status: s?.status ?? null,
          total_savings_eur: Number(s?.total_savings_eur ?? 0),
          aicono_amount_eur: Number(s?.aicono_amount_eur ?? 0),
        };
      });
    },
  });

  const rows = query.data ?? [];

  const kpis = useMemo(() => {
    const active = rows.filter(r => r.status === "active").length;
    const totalSavings = rows.reduce((s, r) => s + r.total_savings_eur, 0);
    const totalAicono = rows.reduce((s, r) => s + r.aicono_amount_eur, 0);
    const openDrafts = rows.filter(r => r.latest_status === "draft" || r.latest_status === "approved").length;
    return { active, totalSavings, totalAicono, openDrafts };
  }, [rows]);

  return (
    <div className="flex min-h-screen">
      <SuperAdminSidebar />
      <main className="flex-1 p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Euro className="h-6 w-6" />Gain-Sharing – Übersicht</h1>
          <p className="text-sm text-muted-foreground">Einsparbeteiligung aller Mandanten mit aktivem Modul.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Aktive Verträge</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{kpis.active}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Einsparung letztes Jahr (Σ)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{fmt(kpis.totalSavings)} €</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">AICONO-Anteil (Σ)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{fmt(kpis.totalAicono)} €</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Offene Freigaben</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{kpis.openDrafts}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Mandanten mit Gain-Sharing-Vertrag</CardTitle></CardHeader>
          <CardContent>
            {query.isLoading ? <p className="text-sm text-muted-foreground">Lädt…</p> : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Verträge angelegt.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mandant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Baseline-Jahr</TableHead>
                  <TableHead className="text-right">AICONO %</TableHead>
                  <TableHead>Letztes Jahr</TableHead>
                  <TableHead className="text-right">Einsparung (€)</TableHead>
                  <TableHead className="text-right">AICONO-Anteil (€)</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.contract_id}>
                      <TableCell className="font-medium">{r.tenant_name}</TableCell>
                      <TableCell><Badge variant={r.status === "active" ? "default" : "outline"}>{r.status}</Badge></TableCell>
                      <TableCell>{r.baseline_year}</TableCell>
                      <TableCell className="text-right">{fmt(r.aicono_share_pct)} %</TableCell>
                      <TableCell>{r.latest_year ?? "–"} {r.latest_status && <Badge variant="outline" className="ml-1">{r.latest_status}</Badge>}</TableCell>
                      <TableCell className="text-right">{fmt(r.total_savings_eur)}</TableCell>
                      <TableCell className="text-right">{fmt(r.aicono_amount_eur)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/super-admin/tenants/${r.tenant_id}`}><ExternalLink className="w-4 h-4" /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
