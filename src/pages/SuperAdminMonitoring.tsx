import { useSATranslation } from "@/hooks/useSATranslation";
import { useInfraMetrics } from "@/hooks/useInfraMetrics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, Database, Server, HardDrive, Activity,
  CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import { format } from "date-fns";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function HealthBadge({ status }: { status: string }) {
  if (status === "healthy") {
    return (
      <Badge variant="default" className="bg-green-500/15 text-green-600 border-green-500/30">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Healthy
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" /> Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <AlertCircle className="h-3 w-3 mr-1" /> Unknown
    </Badge>
  );
}

export default function SuperAdminMonitoring() {
  const { t } = useSATranslation();
  const {
    isLoading, collectMetrics, getLatest, getTimeSeries,
    getHealthStatus, getTableSizes,
  } = useInfraMetrics();

  const health = getHealthStatus();
  const dbSize = getLatest("disk_usage", "database_size_bytes");
  const activeConns = getLatest("db_connections", "active_connections");
  const maxConns = getLatest("db_connections", "max_connections");
  const tableCount = getLatest("db_info", "table_count");
  const tableSizes = getTableSizes();

  const connTimeSeries = getTimeSeries("db_connections", "active_connections", 48).map((m) => ({
    time: format(new Date(m.recorded_at), "HH:mm"),
    value: m.metric_value ?? 0,
  }));

  const dbSizeTimeSeries = getTimeSeries("disk_usage", "database_size_bytes", 48).map((m) => ({
    time: format(new Date(m.recorded_at), "HH:mm"),
    value: (m.metric_value ?? 0) / (1024 * 1024),
  }));

  const connPct = activeConns && maxConns
    ? ((activeConns.metric_value ?? 0) / (maxConns.metric_value ?? 1)) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("monitoring.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("monitoring.subtitle")}</p>
        </div>
        <Button
          onClick={() => collectMetrics.mutate()}
          disabled={collectMetrics.isPending}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${collectMetrics.isPending ? "animate-spin" : ""}`} />
          {t("monitoring.collect_now")}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          {/* System Health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {t("monitoring.system_health")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {Object.entries(health).length > 0 ? (
                  Object.entries(health).map(([service, status]) => (
                    <div key={service} className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">{service}:</span>
                      <HealthBadge status={status} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{t("monitoring.no_data")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  {t("monitoring.db_connections")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {activeConns?.metric_value ?? "–"} / {maxConns?.metric_value ?? "–"}
                </p>
                <Progress value={connPct} className="mt-2 h-2" />
                <p className="text-xs text-muted-foreground mt-1">{connPct.toFixed(1)}% {t("monitoring.utilization")}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  {t("monitoring.db_size")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {dbSize ? formatBytes(dbSize.metric_value ?? 0) : "–"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tableCount?.metric_value ?? 0} {t("monitoring.tables")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  {t("monitoring.app_tenants")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {getLatest("app_counts", "tenants")?.metric_value ?? "–"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {getLatest("app_counts", "users")?.metric_value ?? 0} {t("monitoring.users")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  {t("monitoring.meters_locations")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {getLatest("app_counts", "meters")?.metric_value ?? "–"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {getLatest("app_counts", "locations")?.metric_value ?? 0} {t("monitoring.locations")}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* DB Connections Over Time */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("monitoring.connections_chart")}</CardTitle>
              </CardHeader>
              <CardContent>
                {connTimeSeries.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={connTimeSeries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t("monitoring.not_enough_data")}</p>
                )}
              </CardContent>
            </Card>

            {/* DB Size Over Time */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{t("monitoring.db_size_chart")}</CardTitle>
              </CardHeader>
              <CardContent>
                {dbSizeTimeSeries.length > 1 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dbSizeTimeSeries}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <YAxis tick={{ fontSize: 11 }} unit=" MB" className="fill-muted-foreground" />
                      <Tooltip formatter={(v: number) => `${v.toFixed(2)} MB`} />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t("monitoring.not_enough_data")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Table Sizes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{t("monitoring.table_sizes")}</CardTitle>
            </CardHeader>
            <CardContent>
              {tableSizes.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={tableSizes
                      .sort((a, b) => (b.metric_value ?? 0) - (a.metric_value ?? 0))
                      .slice(0, 10)
                      .map((m) => ({
                        name: m.metric_name,
                        size: (m.metric_value ?? 0) / (1024 * 1024),
                      }))}
                    layout="vertical"
                    margin={{ left: 120 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" unit=" MB" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={110} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)} MB`} />
                    <Bar dataKey="size" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">{t("monitoring.no_data")}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
