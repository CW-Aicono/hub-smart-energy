import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { BarChart3, Download, TrendingUp, Building2, Euro, Package, AlertTriangle } from "lucide-react";

const fmtInt = (v: number) => Number(v ?? 0).toLocaleString("de-DE");
const fmtEur = (v: number) => Number(v ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtMonth = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
};
const STALE = 5 * 60_000;

export default function PartnerReporting() {
  const { partnerId, permissions, loading } = usePartnerAccess();

  const { data: overview } = useQuery({
    queryKey: ["partner-reporting-overview", partnerId],
    enabled: !!partnerId && permissions.viewBilling,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("partner_reporting_overview", { _partner_id: partnerId });
      if (error) throw error;
      return data as Record<string, number>;
    },
  });

  const { data: growth = [] } = useQuery({
    queryKey: ["partner-reporting-growth", partnerId],
    enabled: !!partnerId && permissions.viewBilling,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("partner_reporting_growth", { _partner_id: partnerId });
      if (error) throw error;
      return (data ?? []) as Array<{ month_start: string; tenants_total: number; mrr_eur: number }>;
    },
  });

  const { data: modules = [] } = useQuery({
    queryKey: ["partner-reporting-modules", partnerId],
    enabled: !!partnerId && permissions.viewBilling,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("partner_reporting_modules", { _partner_id: partnerId });
      if (error) throw error;
      return (data ?? []) as Array<{ module_code: string; tenants_count: number }>;
    },
  });

  const growthData = useMemo(
    () =>
      growth.map((g) => ({
        label: fmtMonth(g.month_start),
        Tenants: g.tenants_total,
        MRR: Number(g.mrr_eur),
      })),
    [growth],
  );

  const moduleData = useMemo(
    () => modules.map((m) => ({ label: m.module_code, Tenants: m.tenants_count })),
    [modules],
  );

  const handleCsvExport = () => {
    const rows = [
      ["Kennzahl", "Wert"],
      ["Tenants gesamt", fmtInt(overview?.tenants_total ?? 0)],
      ["Tenants aktiv", fmtInt(overview?.tenants_active ?? 0)],
      ["Tenants gesperrt", fmtInt(overview?.tenants_suspended ?? 0)],
      ["Tenants archiviert", fmtInt(overview?.tenants_deleted ?? 0)],
      ["Neu (30 Tage)", fmtInt(overview?.tenants_new_30d ?? 0)],
      ["MRR (€)", fmtEur(Number(overview?.mrr_eur ?? 0))],
      ["Aktive Module gesamt", fmtInt(overview?.modules_active ?? 0)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `partner-reporting-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-6 text-muted-foreground">Lädt…</div>;
  if (!permissions.viewBilling) {
    return (
      <div className="p-6 max-w-3xl">
        <Card>
          <CardContent className="p-6 flex items-center gap-3 text-muted-foreground">
            <AlertTriangle className="h-5 w-5" />
            Sie haben keine Berechtigung „Abrechnung sehen". Bitte wenden Sie sich an Ihren Partner-Admin.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Reporting</h1>
          <p className="text-muted-foreground">Kennzahlen, Wachstum und Modul-Verteilung Ihres Partner-Portfolios.</p>
        </div>
        <Button variant="outline" onClick={handleCsvExport}><Download className="h-4 w-4 mr-2" /> CSV exportieren</Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={<Building2 className="h-4 w-4" />} label="Tenants aktiv" value={fmtInt(overview?.tenants_active ?? 0)} sub={`${fmtInt(overview?.tenants_total ?? 0)} gesamt`} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Neu (30 Tage)" value={fmtInt(overview?.tenants_new_30d ?? 0)} sub="Wachstum" />
        <Kpi icon={<Euro className="h-4 w-4" />} label="MRR" value={fmtEur(Number(overview?.mrr_eur ?? 0))} sub="Monatlich wiederkehrend" />
        <Kpi icon={<Package className="h-4 w-4" />} label="Module aktiv" value={fmtInt(overview?.modules_active ?? 0)} sub="Summe Tenant-Module" />
      </div>

      {(overview?.tenants_suspended ?? 0) + (overview?.tenants_deleted ?? 0) > 0 && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3 text-sm">
            <Badge variant="secondary">{fmtInt(overview?.tenants_suspended ?? 0)} gesperrt</Badge>
            <Badge variant="destructive">{fmtInt(overview?.tenants_deleted ?? 0)} archiviert</Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Wachstum (12 Monate)</CardTitle>
          <CardDescription>Tenants insgesamt und MRR pro Monat.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" />
                <YAxis yAxisId="left" tickFormatter={(v) => fmtInt(v)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmtInt(v)} />
                <Tooltip
                  formatter={(v: any, name: string) => (name === "MRR" ? fmtEur(Number(v)) : fmtInt(Number(v)))}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="Tenants" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="MRR" stroke="hsl(var(--accent))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modul-Verteilung</CardTitle>
          <CardDescription>Anzahl Tenants pro Modul (nur aktive).</CardDescription>
        </CardHeader>
        <CardContent>
          {moduleData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine aktiven Module.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={moduleData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => fmtInt(v)} />
                  <Tooltip formatter={(v: any) => fmtInt(Number(v))} />
                  <Bar dataKey="Tenants" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="text-muted-foreground">{icon}</div>
        </div>
        <p className="text-2xl font-bold mt-2">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
