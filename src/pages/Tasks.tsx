import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [externalFilter, setExternalFilter] = useState(false);

  // Unified toggle: activating one group resets all others
  const toggleStatus = (val: string) => {
    setPriorityFilter("all");
    setOverdueFilter(false);
    setExternalFilter(false);
    setStatusFilter((prev) => (prev === val ? "all" : val));
  };
  const togglePriority = (val: string) => {
    setStatusFilter("all");
    setOverdueFilter(false);
    setExternalFilter(false);
    setPriorityFilter((prev) => (prev === val ? "all" : val));
  };
  const toggleOverdue = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setExternalFilter(false);
    setOverdueFilter((prev) => !prev);
  };
  const toggleExternal = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setOverdueFilter(false);
    setExternalFilter((prev) => !prev);
  };

  if (authLoading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-background">
        <DashboardSidebar />
        <main className="flex-1 p-3 md:p-6"><Skeleton className="h-8 w-64" /></main>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const filtered = tasks.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchPriority = priorityFilter === "all" || t.priority === priorityFilter;
    const matchSource = sourceFilter === "all" || t.source_type === sourceFilter;
    const matchOverdue = !overdueFilter || (
      t.due_date && t.status !== "done" && t.status !== "cancelled" && new Date(t.due_date) < new Date()
    );
    const matchExternal = !externalFilter || (
      t.external_contact_name && t.status !== "done" && t.status !== "cancelled"
    );
    return matchSearch && matchStatus && matchPriority && matchSource && matchOverdue && matchExternal;
  });

  const countOpen = tasks.filter((t) => t.status === "open").length;
  const countInProgress = tasks.filter((t) => t.status === "in_progress").length;
  const countDone = tasks.filter((t) => t.status === "done").length;
  const countCritical = tasks.filter((t) => t.priority === "critical" && t.status !== "done" && t.status !== "cancelled").length;
  const countOverdue = tasks.filter((t) =>
    t.due_date && t.status !== "done" && t.status !== "cancelled" && new Date(t.due_date) < new Date()
  ).length;
  const countExternal = tasks.filter((t) => t.external_contact_name && t.status !== "done" && t.status !== "cancelled").length;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-3 md:p-6 space-y-6 max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ListChecks className="h-6 w-6 text-primary" />
                Aufgabenverwaltung
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Verwalten Sie Aufgaben im Team, weisen Sie externe Dienstleister zu oder reagieren Sie auf Systemereignisse.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Neue Aufgabe
            </Button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={<Circle className="h-4 w-4 text-muted-foreground" />} label="Offen" value={countOpen} onClick={() => toggleStatus("open")} active={statusFilter === "open"} />
            <KpiCard icon={<ArrowRight className="h-4 w-4 text-primary" />} label="In Bearbeitung" value={countInProgress} onClick={() => toggleStatus("in_progress")} active={statusFilter === "in_progress"} />
            <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="Erledigt" value={countDone} onClick={() => toggleStatus("done")} active={statusFilter === "done"} />
            <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Kritisch" value={countCritical} variant={countCritical > 0 ? "destructive" : "default"} onClick={() => togglePriority("critical")} active={priorityFilter === "critical"} />
            <KpiCard icon={<Zap className="h-4 w-4 text-warning" />} label="Überfällig" value={countOverdue} variant={countOverdue > 0 ? "warning" : "default"} onClick={toggleOverdue} active={overdueFilter} />
            <KpiCard icon={<ExternalLink className="h-4 w-4 text-secondary-foreground" />} label="Extern offen" value={countExternal} onClick={toggleExternal} active={externalFilter} />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Aufgaben durchsuchen..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Priorität" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Prioritäten</SelectItem>
                <SelectItem value="low">🟢 Niedrig</SelectItem>
                <SelectItem value="medium">🟡 Mittel</SelectItem>
                <SelectItem value="high">🟠 Hoch</SelectItem>
                <SelectItem value="critical">🔴 Kritisch</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Quelle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Quellen</SelectItem>
                <SelectItem value="manual">👤 Manuell</SelectItem>
                <SelectItem value="alert">⚠️ Alarm</SelectItem>
                <SelectItem value="charging">⚡ Ladesäule</SelectItem>
                <SelectItem value="automation">🤖 Automatisierung</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Task List */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState hasFilters={search !== "" || statusFilter !== "all" || priorityFilter !== "all" || overdueFilter || externalFilter} onCreateTask={() => setCreateOpen(true)} />
          ) : (
            <div className="space-y-3">
              {filtered.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
              <p className="text-xs text-center text-muted-foreground pt-2">
                {filtered.length} von {tasks.length} Aufgaben angezeigt
              </p>
            </div>
          )}

          {/* Concept info boxes */}
          <ConceptInfoBoxes />
        </div>
      </main>
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};

// ---- Sub-components ----

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant?: "default" | "destructive" | "warning";
  onClick?: () => void;
  active?: boolean;
}

const KpiCard = ({ icon, label, value, variant = "default", onClick, active }: KpiCardProps) => (
  <Card
    className={[
      "transition-all",
      onClick ? "cursor-pointer hover:shadow-md" : "",
      active ? "ring-2 ring-primary" : "",
      variant === "destructive" && value > 0 ? "border-destructive/40 bg-destructive/5" : "",
      variant === "warning" && value > 0 ? "border-amber-400/40 bg-amber-500/5" : "",
    ].join(" ")}
    onClick={onClick}
  >
    <CardContent className="p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        {icon}
        <span className={[
          "text-2xl font-bold",
          variant === "destructive" && value > 0 ? "text-destructive" : "",
          variant === "warning" && value > 0 ? "text-amber-600 dark:text-amber-400" : "",
        ].join(" ")}>{value}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </CardContent>
  </Card>
);

const EmptyState = ({ hasFilters, onCreateTask }: { hasFilters: boolean; onCreateTask: () => void }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <ListChecks className="h-12 w-12 text-muted-foreground/30 mb-4" />
    {hasFilters ? (
      <>
        <h3 className="font-medium text-muted-foreground">Keine Aufgaben gefunden</h3>
        <p className="text-sm text-muted-foreground mt-1">Passen Sie die Filter an oder erstellen Sie eine neue Aufgabe.</p>
      </>
    ) : (
      <>
        <h3 className="font-semibold">Noch keine Aufgaben vorhanden</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Erstellen Sie Ihre erste Aufgabe manuell oder warten Sie auf automatisch generierte Aufgaben aus Alarmen oder Störungen.
        </p>
        <Button className="mt-4 gap-2" onClick={onCreateTask}>
          <Plus className="h-4 w-4" /> Erste Aufgabe erstellen
        </Button>
      </>
    )}
  </div>
);

const ConceptInfoBoxes = () => (
  <div className="grid md:grid-cols-3 gap-4 pt-4 border-t border-border">
    <ConceptBox
      icon={<AlertTriangle className="h-5 w-5 text-foreground" />}
      title="Auto. Aufgaben aus Alarmen"
      description="Wenn ein Alarm ausgelöst wird – z. B. Schwellenwert überschritten oder Gerät ausgefallen – wird automatisch eine Aufgabe mit Priorität und Quell-Referenz erstellt."
      badge="Geplant"
    />
    <ConceptBox
      icon={<PlugZap className="h-5 w-5 text-primary" />}
      title="Ladesäulen-Störungen"
      description="Bei OCPP-Fehlern oder Offline-Ladesäulen wird automatisch eine Aufgabe mit Störungsdetails und Standort erstellt, direkt verlinkt mit dem betroffenen Ladepunkt."
      badge="Geplant"
    />
    <ConceptBox
      icon={<ExternalLink className="h-5 w-5 text-primary" />}
      title="Externes Ticketing"
      description="Aufgaben an externe Dienstleister können per E-Mail weitergeleitet werden. Eine Integration mit Ticketsystemen (z. B. ServiceNow, Jira) ist vorgesehen."
      badge="Idee"
    />
  </div>
);

const ConceptBox = ({ icon, title, description, badge }: {
  icon: React.ReactNode; title: string; description: string; badge: string;
}) => (
  <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/30">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <Badge variant="outline" className="text-xs">{badge}</Badge>
    </div>
    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
  </div>
);

export default Tasks;
