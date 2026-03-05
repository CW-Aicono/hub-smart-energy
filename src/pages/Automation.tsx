import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { useMLAutomations, MLAutomationRecord } from "@/hooks/useMLAutomations";
import { useAutomationAI } from "@/hooks/useAutomationAI";
import { useLocations } from "@/hooks/useLocations";
import { useIntegrations } from "@/hooks/useIntegrations";
import { AutomationRuleBuilder, AutomationRuleData } from "@/components/locations/AutomationRuleBuilder";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AiDisclaimer } from "@/components/ui/ai-disclaimer";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Cpu, Zap, BrainCircuit, Thermometer, Lightbulb, Wind, TrendingDown, ArrowRight, Plus,
  Settings2, Activity, Server, Clock, CheckCircle2, AlertTriangle, Sparkles, MapPin,
  Building2, Layers, DoorOpen, ChevronRight, Play, Loader2, Pencil, Trash2,
  RefreshCw, Download, XCircle, Timer, FileText, Search, Filter, GitBranch,
} from "lucide-react";

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Thermometer; color: string }> = {
  heating: { label: "Heizung", icon: Thermometer, color: "#ef4444" },
  lighting: { label: "Beleuchtung", icon: Lightbulb, color: "#f59e0b" },
  hvac: { label: "Lüftung/Klima", icon: Wind, color: "#06b6d4" },
  peak_shaving: { label: "Lastmanagement", icon: TrendingDown, color: "#8b5cf6" },
  custom: { label: "Sonstige", icon: Zap, color: "#10b981" },
};

const Automation = () => {
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);
  const [activeTab, setActiveTab] = useState("automations");

  // Data hooks
  const {
    automations, executionLog, stats, loading, logLoading, executing,
    refetch, fetchExecutionLog, filterAutomations, updateAutomation,
    deleteAutomation, executeAutomation,
  } = useMLAutomations();

  const { recommendations, loading: aiLoading, totalSavingsPotential, fetchRecommendations } = useAutomationAI();
  const { locations } = useLocations();
  const { integrations } = useIntegrations();

  // Filters
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Rule builder state
  const [ruleBuilderOpen, setRuleBuilderOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MLAutomationRecord | null>(null);

  // Sensors: empty for now (rule editing for MLA uses location-level builder)
  const sensors: any[] = [];
  const sensorsLoading = false;

  // Fetch log when tab switches
  useEffect(() => {
    if (activeTab === "log") fetchExecutionLog();
  }, [activeTab, fetchExecutionLog]);

  // Fetch AI recommendations on first visit to AI tab
  useEffect(() => {
    if (activeTab === "ai" && recommendations.length === 0 && !aiLoading) {
      fetchRecommendations();
    }
  }, [activeTab]);

  const filtered = filterAutomations({
    locationId: filterLocation !== "all" ? filterLocation : undefined,
    category: filterCategory !== "all" ? filterCategory : undefined,
    status: filterStatus as any,
    search: searchTerm,
  });

  // Gateway data from real integrations
  const gatewayIntegrations = integrations.filter((i) =>
    ["loxone_miniserver", "loxone_miniserver_go", "home_assistant"].includes(i.type)
  );

  const handleExecute = async (auto: MLAutomationRecord) => {
    const result = await executeAutomation(auto);
    if (result.success) {
      toast.success(T("automation.executed").replace("{name}", auto.name));
    } else {
      toast.error(result.error || T("automation.executeFailed"));
    }
  };

  const handleToggle = async (auto: MLAutomationRecord, checked: boolean) => {
    await updateAutomation(auto.id, { is_active: checked });
  };

  const handleDelete = async (auto: MLAutomationRecord) => {
    const { error } = await deleteAutomation(auto.id);
    if (error) toast.error(T("automation.errorDelete"));
    else toast.success(T("automation.deleted"));
  };

  const openEdit = (auto: MLAutomationRecord) => {
    setEditTarget(auto);
    setRuleBuilderOpen(true);
  };

  const openCreate = () => {
    setEditTarget(null);
    setRuleBuilderOpen(true);
  };

  const handleSaveRule = async (data: AutomationRuleData) => {
    if (!editTarget) {
      toast.info("Bitte erstellen Sie neue Regeln über die Standort-Detailseite.");
      return;
    }
    const primary = data.actions[0];
    if (editTarget) {
      const { error } = await updateAutomation(editTarget.id, {
        name: data.name,
        description: data.description || undefined,
        actuator_uuid: primary.actuator_uuid,
        actuator_name: primary.actuator_name,
        actuator_control_type: primary.control_type,
        action_type: primary.action_type === "pulse" ? "pulse" : "command",
        action_value: primary.action_value || primary.action_type,
        conditions: data.conditions,
        actions: data.actions,
        logic_operator: data.logic_operator,
        is_active: data.is_active,
      });
      if (error) throw error;
      toast.success(T("automation.updated"));
    } else {
      // For new rules we need a location + integration
      toast.info("Bitte erstellen Sie neue Regeln über die Standort-Detailseite.");
    }
  };

  const exportLogCsv = () => {
    const headers = ["Zeitpunkt", "Regelname", "Trigger", "Status", "Fehler", "Dauer (ms)"];
    const rows = executionLog.map((log) => [
      format(new Date(log.executed_at), "dd.MM.yyyy HH:mm:ss"),
      log.automation_name || "",
      log.trigger_type,
      log.status,
      log.error_message || "",
      log.duration_ms?.toString() || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `automation-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-auto p-3 md:p-6"><Skeleton className="h-8 w-64 mb-6" /><Skeleton className="h-96" /></main>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <header className="border-b p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                <Cpu className="h-6 w-6 text-primary" />
                {T("automation.title")}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{T("automation.subtitle")}</p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {T("automation.newAutomation")}
            </Button>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Zap className="h-5 w-5 text-primary" /></div><div><p className="text-2xl font-bold">{loading ? "–" : stats.total}</p><p className="text-xs text-muted-foreground">{T("automation.automations")}</p></div></CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div><div><p className="text-2xl font-bold">{loading ? "–" : stats.active}</p><p className="text-xs text-muted-foreground">{T("automation.activeCount")}</p></div></CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center"><BrainCircuit className="h-5 w-5 text-violet-600" /></div><div><p className="text-2xl font-bold">{aiLoading ? "–" : recommendations.length}</p><p className="text-xs text-muted-foreground">{T("automation.aiRecommendations")}</p></div></CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center"><Server className="h-5 w-5 text-cyan-600" /></div><div><p className="text-2xl font-bold">{gatewayIntegrations.length}</p><p className="text-xs text-muted-foreground">{T("automation.gatewayOnline")}</p></div></CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><TrendingDown className="h-5 w-5 text-amber-600" /></div><div><p className="text-2xl font-bold">{stats.totalSavingsKwh > 0 ? `~${Math.round(stats.totalSavingsKwh)}` : "–"}</p><p className="text-xs text-muted-foreground">{T("automation.savingsKwh")}</p></div></CardContent></Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="automations" className="gap-1.5"><Zap className="h-4 w-4" /> {T("automation.tabAutomations")}</TabsTrigger>
              <TabsTrigger value="ai" className="gap-1.5"><BrainCircuit className="h-4 w-4" /> {T("automation.tabAi")}</TabsTrigger>
              <TabsTrigger value="gateways" className="gap-1.5"><Server className="h-4 w-4" /> {T("automation.tabGateways")}</TabsTrigger>
              <TabsTrigger value="log" className="gap-1.5"><FileText className="h-4 w-4" /> {T("automation.tabLog")}</TabsTrigger>
            </TabsList>

            {/* ── Tab: Automations ── */}
            <TabsContent value="automations" className="space-y-4 mt-4">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={T("automation.searchPlaceholder")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={filterLocation} onValueChange={setFilterLocation}>
                  <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={T("automation.allLocations")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{T("automation.allLocations")}</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder={T("automation.allCategories")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{T("automation.allCategories")}</SelectItem>
                    {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{T("automation.allStatuses")}</SelectItem>
                    <SelectItem value="active">{T("automation.activeCount")}</SelectItem>
                    <SelectItem value="paused">{T("automation.paused")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
              ) : filtered.length === 0 ? (
                <div className="flex justify-center pt-8">
                  <div className="text-center space-y-2 max-w-md">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto"><Sparkles className="h-6 w-6 text-primary" /></div>
                    <p className="text-sm text-muted-foreground">{T("automation.createHint")}</p>
                  </div>
                </div>
              ) : (
                filtered.map((auto) => {
                  const catCfg = CATEGORY_CONFIG[auto.category] || CATEGORY_CONFIG.custom;
                  const CatIcon = catCfg.icon;
                  const isExec = executing === auto.id;

                  return (
                    <Card key={auto.id} className="overflow-hidden">
                      <div className="flex">
                        <div className="w-1.5 shrink-0" style={{ backgroundColor: auto.color || catCfg.color }} />
                        <div className="flex-1 p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${auto.color || catCfg.color}15` }}>
                                {auto.conditions?.length > 0 ? (
                                  <GitBranch className="h-5 w-5" style={{ color: auto.color || catCfg.color }} />
                                ) : (
                                  <CatIcon className="h-5 w-5" style={{ color: auto.color || catCfg.color }} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold">{auto.name}</h3>
                                  <Badge variant="outline" className="text-[10px]">{catCfg.label}</Badge>
                                  {auto.actions?.length > 1 && (
                                    <Badge variant="secondary" className="text-[10px]">{auto.actions.length} Aktionen</Badge>
                                  )}
                                  {auto.tags?.map((tag) => (
                                    <Badge key={tag} variant="secondary" className="text-[10px] bg-muted">{tag}</Badge>
                                  ))}
                                </div>
                                {auto.description && <p className="text-sm text-muted-foreground mt-0.5">{auto.description}</p>}
                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1"><Server className="h-3 w-3" /> {auto.actuator_name}</span>
                                  {auto.last_executed_at && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {formatDistanceToNow(new Date(auto.last_executed_at), { addSuffix: true, locale: de })}
                                    </span>
                                  )}
                                  {auto.estimated_savings_kwh && (
                                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                      <TrendingDown className="h-3 w-3" /> ~{auto.estimated_savings_kwh} kWh/Mo
                                    </span>
                                  )}
                                </div>
                                {/* Scope breadcrumb */}
                                <div className="flex items-center gap-1 mt-2 text-xs">
                                  <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="font-medium text-foreground">{auto.location_name}</span>
                                  {auto.scope_type !== "location" && auto.scope_type !== "cross_location" && (
                                    <span className="text-muted-foreground ml-1">({auto.scope_type})</span>
                                  )}
                                  {auto.scope_type === "cross_location" && (
                                    <span className="text-muted-foreground ml-1">+ {(auto.target_location_ids?.length || 0)} weitere</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleExecute(auto)} disabled={isExec || !auto.is_active} title={T("automation.executeNow")}>
                                {isExec ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(auto)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(auto)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              <Switch checked={auto.is_active} onCheckedChange={(c) => handleToggle(auto, c)} className="ml-1" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            {/* ── Tab: AI ── */}
            <TabsContent value="ai" className="space-y-4 mt-4">
              <Card className="border-violet-500/20 bg-violet-500/5">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <BrainCircuit className="h-5 w-5 text-violet-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{T("automation.aiActive")}</p>
                      <p className="text-xs text-muted-foreground">{T("automation.aiActiveDesc")}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => fetchRecommendations(true)} disabled={aiLoading} className="gap-1.5">
                    <RefreshCw className={`h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`} />
                    {T("automation.refresh")}
                  </Button>
                </CardContent>
              </Card>

              {aiLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
              ) : recommendations.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <BrainCircuit className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p>{T("automation.noRecommendations")}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchRecommendations(true)}>
                    {T("automation.generateRecommendations")}
                  </Button>
                </div>
              ) : (
                <>
                  {recommendations.map((rec) => {
                    const catCfg = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG.custom;
                    return (
                      <Card key={rec.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-violet-500" />
                                <h3 className="font-semibold">{rec.title}</h3>
                                <Badge variant="outline" className="text-[10px]">{catCfg.label}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{rec.description}</p>
                              <div className="flex items-center gap-4 mt-2">
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
                                  <TrendingDown className="h-3 w-3 mr-1" />~{rec.estimated_savings_kwh} kWh/Mo
                                </Badge>
                                <span className="text-xs text-muted-foreground">{T("automation.confidence")} {rec.confidence}%</span>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="shrink-0 ml-4" disabled>
                              {T("automation.createAutomation")}<ArrowRight className="h-3 w-3 ml-1" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  <div className="flex justify-center pt-4">
                    <div className="text-center space-y-2 max-w-md">
                      <p className="text-sm font-medium text-violet-600">{T("automation.totalPotential")}</p>
                      <p className="text-3xl font-bold">~{Math.round(totalSavingsPotential)} kWh/{T("automation.month")}</p>
                      <p className="text-xs text-muted-foreground">{T("automation.aiLearning")}</p>
                    </div>
                  </div>
                </>
              )}
              <AiDisclaimer text={T("automation.aiDisclaimer")} />
            </TabsContent>

            {/* ── Tab: Gateways ── */}
            <TabsContent value="gateways" className="space-y-4 mt-4">
              {gatewayIntegrations.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Server className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p>{T("automation.noGateways")}</p>
                </div>
              ) : (
                gatewayIntegrations.map((gw) => {
                  const gwType = gw.type;

                  return (
                    <Card key={gw.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-emerald-500/10">
                              <Server className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{gw.name}</h3>
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"><Activity className="h-3 w-3 mr-1" /> {T("automation.online")}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{gwType}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}

              <Card className="border-dashed">
                <CardContent className="p-6 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto"><Plus className="h-6 w-6 text-muted-foreground" /></div>
                  <div>
                    <p className="font-medium">{T("automation.moreGateways")}</p>
                    <p className="text-sm text-muted-foreground">{T("automation.moreGatewaysDesc")}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Tab: Execution Log ── */}
            <TabsContent value="log" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{T("automation.executionLog")}</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fetchExecutionLog()} disabled={logLoading} className="gap-1.5">
                    <RefreshCw className={`h-3.5 w-3.5 ${logLoading ? "animate-spin" : ""}`} />
                    {T("automation.refresh")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportLogCsv} disabled={executionLog.length === 0} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                </div>
              </div>

              {logLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : executionLog.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  <p>{T("automation.noLogEntries")}</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{T("automation.logTime")}</TableHead>
                        <TableHead>{T("automation.logRule")}</TableHead>
                        <TableHead>{T("automation.logTrigger")}</TableHead>
                        <TableHead>{T("automation.logStatus")}</TableHead>
                        <TableHead className="text-right">{T("automation.logDuration")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {executionLog.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(log.executed_at), "dd.MM.yy HH:mm:ss")}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{log.automation_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {log.trigger_type === "manual" ? "Manuell" : log.trigger_type === "schedule" ? "Zeitplan" : log.trigger_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {log.status === "success" ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Erfolg
                              </Badge>
                            ) : (
                              <div>
                                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                                  <XCircle className="h-3 w-3 mr-1" /> Fehler
                                </Badge>
                                {log.error_message && (
                                  <p className="text-[10px] text-destructive mt-1">{log.error_message}</p>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {log.duration_ms ? `${log.duration_ms} ms` : "–"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Rule Builder Sheet */}
      <AutomationRuleBuilder
        open={ruleBuilderOpen}
        onOpenChange={setRuleBuilderOpen}
        sensors={sensors || []}
        sensorsLoading={sensorsLoading}
        initialData={editTarget ? {
          name: editTarget.name,
          description: editTarget.description || "",
          conditions: editTarget.conditions,
          actions: editTarget.actions,
          logic_operator: editTarget.logic_operator,
          is_active: editTarget.is_active,
        } : undefined}
        onSave={handleSaveRule}
        isEdit={!!editTarget}
      />
    </div>
  );
};

export default Automation;
