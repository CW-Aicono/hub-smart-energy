import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { useSATranslation } from "@/hooks/useSATranslation";
import { useHistoricalPlatformMetrics } from "@/hooks/useHistoricalPlatformMetrics";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { format } from "date-fns";

const COLORS = ["hsl(152,55%,42%)", "hsl(200,70%,50%)", "hsl(38,92%,50%)", "hsl(220,60%,50%)", "hsl(0,72%,51%)", "hsl(280,55%,55%)"];

const fmtDe = (n: number, digits = 0) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const SuperAdminStatistics = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { tenantCount, userCount, locationCount } = usePlatformStats();
  const { t } = useSATranslation();
  const { data: history = [] } = useHistoricalPlatformMetrics();

  const mrrSeries = useMemo(() => {
    return history
      .filter((m) => m.metric_key === "mrr_eur")
      .map((m) => ({ time: format(new Date(m.recorded_at), "dd.MM."), value: Number(m.metric_value) }));
  }, [history]);

  const tenantSeries = useMemo(() => {
    return history
      .filter((m) => m.metric_key === "active_tenants")
      .map((m) => ({ time: format(new Date(m.recorded_at), "dd.MM."), value: Number(m.metric_value) }));
  }, [history]);

  const moduleAdoption = useMemo(() => {
    const latest = new Map<string, number>();
    history
      .filter((m) => m.metric_key.startsWith("module_adoption_") || m.metric_key === "module_adoption")
      .forEach((m) => {
        const key = m.dimension ?? m.metric_key.replace("module_adoption_", "");
        latest.set(key, Number(m.metric_value));
      });
    return Array.from(latest.entries()).map(([name, value]) => ({ name, value }));
  }, [history]);

  const firstRecordedAt = useMemo(() => {
    if (!history.length) return null;
    return new Date(history[0].recorded_at);
  }, [history]);

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const overviewData = [
    { name: t("dashboard.tenants"), value: tenantCount },
    { name: t("dashboard.users"), value: userCount },
    { name: t("dashboard.locations"), value: locationCount },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6">
          <h1 className="text-2xl font-bold">{t("statistics.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("statistics.subtitle")}</p>
        </header>
        <div className="p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>{t("statistics.overview")}</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overviewData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v: number) => fmtDe(v)} />
                    <Tooltip formatter={(v: number) => fmtDe(v)} />
                    <Bar dataKey="value" fill="hsl(152,55%,42%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("statistics.distribution")}</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={overviewData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${fmtDe(value as number)}`}>
                      {overviewData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtDe(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Verlauf</h2>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {firstRecordedAt
                  ? `Historie wird seit ${format(firstRecordedAt, "dd.MM.yyyy")} gesammelt.`
                  : "Noch keine historischen Daten vorhanden. Sobald der Sammler läuft, erscheinen hier MRR, Tenant-Verlauf und Modul-Adoption."}
              </AlertDescription>
            </Alert>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>MRR-Verlauf (€)</CardTitle></CardHeader>
              <CardContent className="h-64">
                {mrrSeries.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mrrSeries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={(v: number) => fmtDe(v)} />
                      <Tooltip formatter={(v: number) => `${fmtDe(v, 2)} €`} />
                      <Line type="monotone" dataKey="value" stroke="hsl(152,55%,42%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    Keine MRR-Datenpunkte
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Aktive Tenants (Verlauf)</CardTitle></CardHeader>
              <CardContent className="h-64">
                {tenantSeries.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tenantSeries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" className="text-xs" />
                      <YAxis className="text-xs" tickFormatter={(v: number) => fmtDe(v)} />
                      <Tooltip formatter={(v: number) => fmtDe(v)} />
                      <Line type="monotone" dataKey="value" stroke="hsl(200,70%,50%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    Keine Tenant-Verlaufsdaten
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Modul-Adoption</CardTitle></CardHeader>
              <CardContent className="h-72">
                {moduleAdoption.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={moduleAdoption}
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${fmtDe(value as number)}`}
                      >
                        {moduleAdoption.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtDe(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    Keine Modul-Adoption-Daten
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminStatistics;
