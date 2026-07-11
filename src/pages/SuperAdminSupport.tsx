import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CreateSupportEntryDialog from "@/components/super-admin/CreateSupportEntryDialog";
import { SortableHead, useSortableData } from "@/components/ui/sortable-head";

type SortKey = "tenant" | "reason" | "duration" | "blocks" | "flatrate" | "type" | "start" | "end";

const SuperAdminSupport = () => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: roleLoading } = useSuperAdmin();
  const { t } = useSATranslation();

  const { data: sessions = [] } = useQuery({
    queryKey: ["support-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_sessions")
        .select("*, tenants(name)")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: flatrateTenants = [] } = useQuery({
    queryKey: ["flatrate-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_modules")
        .select("tenant_id")
        .eq("module_code", "remote_support")
        .eq("is_enabled", true);
      if (error) throw error;
      return (data ?? []).map((d: any) => d.tenant_id);
    },
  });

  const flatrateSet = new Set(flatrateTenants);

  const formatDurationRaw = (s: any) => {
    if (s.duration_minutes) return s.duration_minutes;
    if (!s.ended_at) return 0;
    return Math.max(1, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000));
  };

  const calcBlocks = (s: any) => {
    const mins = s.duration_minutes ?? Math.max(1, Math.round((new Date(s.ended_at ?? s.expires_at).getTime() - new Date(s.started_at).getTime()) / 60000));
    return Math.ceil(mins / 15);
  };

  const [search, setSearch] = useState("");
  const filteredSessions = search.trim()
    ? sessions.filter((s: any) => {
        const q = search.toLowerCase();
        return (
          (s.tenants?.name ?? "").toLowerCase().includes(q) ||
          (s.reason ?? "").toLowerCase().includes(q)
        );
      })
    : sessions;

  const { sorted, sort, toggle } = useSortableData<any, SortKey>(filteredSessions, (r, k) => {
    switch (k) {
      case "tenant": return r.tenants?.name ?? "";
      case "reason": return r.reason ?? "";
      case "duration": return formatDurationRaw(r);
      case "blocks": return r.ended_at ? calcBlocks(r) : 0;
      case "flatrate": return flatrateSet.has(r.tenant_id) ? 1 : 0;
      case "type": return r.is_manual ? 1 : 0;
      case "start": return r.started_at ? new Date(r.started_at) : null;
      case "end": return r.ended_at ? new Date(r.ended_at) : null;
      default: return null;
    }
  }, { key: "start", direction: "desc" });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">{t("common.loading")}</div></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const formatDuration = (s: any) => {
    const mins = formatDurationRaw(s);
    return mins > 0 ? `${mins} Min.` : (s.ended_at ? "0 Min." : "–");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("support.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("support.subtitle")}</p>
          </div>
          <CreateSupportEntryDialog />
        </header>
        <div className="p-6 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen (Mandant, Grund)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Card>
            <CardHeader><CardTitle>{t("support.log")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label={t("billing.tenant")} sortKey="tenant" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("support.reason")} sortKey="reason" sort={sort} onToggle={toggle} />
                    <SortableHead label="Dauer" sortKey="duration" sort={sort} onToggle={toggle} />
                    <SortableHead label="Blöcke (15 Min.)" sortKey="blocks" sort={sort} onToggle={toggle} />
                    <SortableHead label="Flatrate" sortKey="flatrate" sort={sort} onToggle={toggle} />
                    <SortableHead label="Typ" sortKey="type" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("support.start")} sortKey="start" sort={sort} onToggle={toggle} />
                    <SortableHead label={t("support.end")} sortKey="end" sort={sort} onToggle={toggle} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("support.no_sessions")}</TableCell></TableRow>
                  ) : (
                    sorted.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.tenants?.name ?? "–"}</TableCell>
                        <TableCell>{s.reason ?? "–"}</TableCell>
                        <TableCell>{formatDuration(s)}</TableCell>
                        <TableCell>{s.ended_at ? calcBlocks(s) : "–"}</TableCell>
                        <TableCell>
                          {flatrateSet.has(s.tenant_id) ? (
                            <Badge variant="secondary">Flatrate</Badge>
                          ) : (
                            <Badge variant="outline">Abrechnung</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.is_manual ? (
                            <Badge variant="outline" className="text-xs">Manuell</Badge>
                          ) : (
                            <Badge variant="default" className="text-xs">Auto</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{new Date(s.started_at).toLocaleString("de-DE")}</TableCell>
                        <TableCell className="text-muted-foreground">{s.ended_at ? new Date(s.ended_at).toLocaleString("de-DE") : t("common.active")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminSupport;
