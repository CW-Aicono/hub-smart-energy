import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { useTasks } from "@/hooks/useTasks";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { TaskCard } from "@/components/tasks/TaskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, CheckCircle2, Circle, ArrowRight, AlertTriangle, ListChecks, Zap, PlugZap, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const Tasks = () => {
  const { user, loading: authLoading } = useAuth();
  const { tasks, isLoading } = useTasks();
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [externalFilter, setExternalFilter] = useState(false);

  const toggleStatus = (val: string) => { setPriorityFilter("all"); setOverdueFilter(false); setExternalFilter(false); setStatusFilter((prev) => (prev === val ? "all" : val)); };
  const togglePriority = (val: string) => { setStatusFilter("all"); setOverdueFilter(false); setExternalFilter(false); setPriorityFilter((prev) => (prev === val ? "all" : val)); };
  const toggleOverdue = () => { setStatusFilter("all"); setPriorityFilter("all"); setExternalFilter(false); setOverdueFilter((prev) => !prev); };
  const toggleExternal = () => { setStatusFilter("all"); setPriorityFilter("all"); setOverdueFilter(false); setExternalFilter((prev) => !prev); };

  if (authLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 p-3 md:p-6"><Skeleton className="h-8 w-64" /></main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const filtered = tasks.filter((tk) => {
    const matchSearch = !search || tk.title.toLowerCase().includes(search.toLowerCase()) || tk.description?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || tk.status === statusFilter;
    const matchPriority = priorityFilter === "all" || tk.priority === priorityFilter;
    const matchSource = sourceFilter === "all" || tk.source_type === sourceFilter;
    const matchOverdue = !overdueFilter || (tk.due_date && tk.status !== "done" && tk.status !== "cancelled" && new Date(tk.due_date) < new Date());
    const matchExternal = !externalFilter || (tk.external_contact_name && tk.status !== "done" && tk.status !== "cancelled");
    return matchSearch && matchStatus && matchPriority && matchSource && matchOverdue && matchExternal;
  });

  const countOpen = tasks.filter((tk) => tk.status === "open").length;
  const countInProgress = tasks.filter((tk) => tk.status === "in_progress").length;
  const countDone = tasks.filter((tk) => tk.status === "done").length;
  const countCritical = tasks.filter((tk) => tk.priority === "critical" && tk.status !== "done" && tk.status !== "cancelled").length;
  const countOverdue = tasks.filter((tk) => tk.due_date && tk.status !== "done" && tk.status !== "cancelled" && new Date(tk.due_date) < new Date()).length;
  const countExternal = tasks.filter((tk) => tk.external_contact_name && tk.status !== "done" && tk.status !== "cancelled").length;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-3 md:p-6 space-y-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ListChecks className="h-6 w-6 text-primary" />
                {t("tasks.title" as any)}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t("tasks.subtitle" as any)}</p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> {t("tasks.newTask" as any)}
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={<Circle className="h-4 w-4 text-muted-foreground" />} label={t("tasks.open" as any)} value={countOpen} onClick={() => toggleStatus("open")} active={statusFilter === "open"} />
            <KpiCard icon={<ArrowRight className="h-4 w-4 text-primary" />} label={t("tasks.inProgress" as any)} value={countInProgress} onClick={() => toggleStatus("in_progress")} active={statusFilter === "in_progress"} />
            <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-success" />} label={t("tasks.done" as any)} value={countDone} onClick={() => toggleStatus("done")} active={statusFilter === "done"} />
            <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label={t("tasks.critical" as any)} value={countCritical} variant={countCritical > 0 ? "destructive" : "default"} onClick={() => togglePriority("critical")} active={priorityFilter === "critical"} />
            <KpiCard icon={<Zap className="h-4 w-4 text-warning" />} label={t("tasks.overdue" as any)} value={countOverdue} variant={countOverdue > 0 ? "warning" : "default"} onClick={toggleOverdue} active={overdueFilter} />
            <KpiCard icon={<ExternalLink className="h-4 w-4 text-secondary-foreground" />} label={t("tasks.externalOpen" as any)} value={countExternal} onClick={toggleExternal} active={externalFilter} />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder={t("tasks.searchPlaceholder" as any)} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tasks.allPriorities" as any)}</SelectItem>
                <SelectItem value="low">🟢 {t("tasks.low" as any)}</SelectItem>
                <SelectItem value="medium">🟡 {t("tasks.medium" as any)}</SelectItem>
                <SelectItem value="high">🟠 {t("tasks.high" as any)}</SelectItem>
                <SelectItem value="critical">🔴 {t("tasks.critical" as any)}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tasks.allSources" as any)}</SelectItem>
                <SelectItem value="manual">👤 {t("tasks.sourceManual" as any)}</SelectItem>
                <SelectItem value="alert">⚠️ {t("tasks.sourceAlert" as any)}</SelectItem>
                <SelectItem value="charging">⚡ {t("tasks.sourceCharging" as any)}</SelectItem>
                <SelectItem value="automation">🤖 {t("tasks.sourceAutomation" as any)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-24 w-full rounded-lg" />))}</div>
          ) : filtered.length === 0 ? (
            <EmptyState t={t} hasFilters={search !== "" || statusFilter !== "all" || priorityFilter !== "all" || overdueFilter || externalFilter} onCreateTask={() => setCreateOpen(true)} />
          ) : (
            <div className="space-y-3">
              {filtered.map((task) => (<TaskCard key={task.id} task={task} />))}
              <p className="text-xs text-center text-muted-foreground pt-2">
                {filtered.length} {t("tasks.showing" as any)} {tasks.length} {t("tasks.tasksShown" as any)}
              </p>
            </div>
          )}

          <ConceptInfoBoxes t={t} />
        </div>
      </main>
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};

interface KpiCardProps { icon: React.ReactNode; label: string; value: number; variant?: "default" | "destructive" | "warning"; onClick?: () => void; active?: boolean; }

const KpiCard = ({ icon, label, value, variant = "default", onClick, active }: KpiCardProps) => (
  <Card className={[
    "transition-all", onClick ? "cursor-pointer hover:shadow-md" : "", active ? "ring-2 ring-primary" : "",
    variant === "destructive" && value > 0 ? "border-destructive/40 bg-destructive/5" : "",
    variant === "warning" && value > 0 ? "border-amber-400/40 bg-amber-500/5" : "",
  ].join(" ")} onClick={onClick}>
    <CardContent className="p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        {icon}
        <span className={["text-2xl font-bold", variant === "destructive" && value > 0 ? "text-destructive" : "", variant === "warning" && value > 0 ? "text-amber-600 dark:text-amber-400" : ""].join(" ")}>{value}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </CardContent>
  </Card>
);

const EmptyState = ({ hasFilters, onCreateTask, t }: { hasFilters: boolean; onCreateTask: () => void; t: (key: any) => string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <ListChecks className="h-12 w-12 text-muted-foreground/30 mb-4" />
    {hasFilters ? (
      <>
        <h3 className="font-medium text-muted-foreground">{t("tasks.noTasksFound")}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t("tasks.adjustFilters")}</p>
      </>
    ) : (
      <>
        <h3 className="font-semibold">{t("tasks.noTasks")}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{t("tasks.noTasksDesc")}</p>
        <Button className="mt-4 gap-2" onClick={onCreateTask}>
          <Plus className="h-4 w-4" /> {t("tasks.createFirst")}
        </Button>
      </>
    )}
  </div>
);

const ConceptInfoBoxes = ({ t }: { t: (key: any) => string }) => (
  <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-border">
    <ConceptBox icon={<AlertTriangle className="h-5 w-5 text-foreground" />} title={t("tasks.autoAlerts")} description={t("tasks.autoAlertsDesc")} badge={t("tasks.planned")} />
    <ConceptBox icon={<PlugZap className="h-5 w-5 text-primary" />} title={t("tasks.chargingFaults")} description={t("tasks.chargingFaultsDesc")} badge={t("tasks.planned")} />
    <ConceptBox icon={<ExternalLink className="h-5 w-5 text-primary" />} title={t("tasks.externalTicketing")} description={t("tasks.externalTicketingDesc")} badge={t("tasks.idea")} />
  </div>
);

const ConceptBox = ({ icon, title, description, badge }: { icon: React.ReactNode; title: string; description: string; badge: string }) => (
  <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/30">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">{icon}<span className="text-sm font-semibold">{title}</span></div>
      <Badge variant="outline" className="text-xs">{badge}</Badge>
    </div>
    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
  </div>
);

export default Tasks;
