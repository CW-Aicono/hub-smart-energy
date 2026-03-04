import { useState } from "react";
import { useTasks, Task, TaskStatus } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import {
  MoreHorizontal, User, ExternalLink, Zap, AlertTriangle, PlugZap,
  Clock, CheckCircle2, Circle, ArrowRight, XCircle, CalendarDays, Trash2,
  History, ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PRIORITY_CONFIG = {
  low: { label: "Niedrig", dot: "🟢", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  medium: { label: "Mittel", dot: "🔵", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  high: { label: "Hoch", dot: "🟠", color: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20" },
  critical: { label: "Kritisch", dot: "🔴", color: "bg-destructive/15 text-destructive border-destructive/20" },
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ElementType; color: string }> = {
  open: { label: "Offen", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "In Bearbeitung", icon: ArrowRight, color: "text-primary" },
  done: { label: "Erledigt", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
  cancelled: { label: "Abgebrochen", icon: XCircle, color: "text-muted-foreground" },
};

const SOURCE_ICONS: Record<string, React.ElementType> = {
  manual: User,
  alert: AlertTriangle,
  charging: PlugZap,
  automation: Zap,
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manuell",
  alert: "Alarm",
  charging: "Ladesäule",
  automation: "Automatisierung",
};

interface TaskCardProps {
  task: Task;
  duplicateCount?: number;
  duplicateIds?: string[];
}

export const TaskCard = ({ task, duplicateCount, duplicateIds }: TaskCardProps) => {
  const { updateTask, deleteTask, bulkUpdateStatus } = useTasks();
  const [detailOpen, setDetailOpen] = useState(false);

  const StatusIcon = STATUS_CONFIG[task.status]?.icon ?? Circle;
  const SourceIcon = SOURCE_ICONS[task.source_type] ?? User;
  const priorityCfg = PRIORITY_CONFIG[task.priority];
  const statusCfg = STATUS_CONFIG[task.status];

  const isOverdue = task.due_date && task.status !== "done" && task.status !== "cancelled"
    && new Date(task.due_date) < new Date();

  const handleStatusChange = (status: TaskStatus) => {
    const ids = duplicateIds && duplicateIds.length > 1 ? duplicateIds : null;
    if (ids) {
      bulkUpdateStatus.mutate({ ids, status });
    } else {
      updateTask.mutate({
        id: task.id,
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
        historyAction: "status_changed",
        historyOldValue: task.status,
        historyNewValue: status,
      });
    }
  };

  return (
    <>
      <Card className={cn(
        "transition-all hover:shadow-md",
        task.status === "done" && "opacity-60",
        task.status === "cancelled" && "opacity-40",
      )}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Status icon */}
            <button
              onClick={() => {
                const next: Record<string, TaskStatus> = { open: "in_progress", in_progress: "done", done: "open", cancelled: "open" };
                handleStatusChange(next[task.status] as TaskStatus);
              }}
              className={cn("mt-0.5 shrink-0 transition-colors hover:scale-110", statusCfg?.color)}
              title={`Status: ${statusCfg?.label}`}
            >
              <StatusIcon className="h-5 w-5" />
            </button>

            <div className="flex-1 min-w-0 space-y-2">
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <button
                  className={cn(
                    "font-medium text-sm leading-snug text-left hover:text-primary transition-colors",
                    task.status === "done" && "line-through text-muted-foreground"
                  )}
                  onClick={() => setDetailOpen(true)}
                >
                  {task.title}
                  {duplicateCount && duplicateCount > 1 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">({duplicateCount}×)</span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(["open", "in_progress", "done", "cancelled"] as TaskStatus[]).map((s) =>
                      s !== task.status && (
                        <DropdownMenuItem key={s} onClick={() => handleStatusChange(s)}>
                          Als „{STATUS_CONFIG[s].label}" markieren
                        </DropdownMenuItem>
                      )
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDetailOpen(true)}>
                      <ArrowLeftRight className="h-4 w-4 mr-2" /> Übergeben / Bearbeiten
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDetailOpen(true)}>
                      <History className="h-4 w-4 mr-2" /> Protokoll anzeigen
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => deleteTask.mutate(task.id)} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Löschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Description */}
              {task.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
              )}

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("text-xs py-0", priorityCfg?.color)}>
                  {priorityCfg?.label}
                </Badge>

                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <SourceIcon className="h-3.5 w-3.5" />
                  {task.source_label ?? SOURCE_LABELS[task.source_type]}
                </span>

                {task.assigned_to_name && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    {task.assigned_to_name}
                  </span>
                )}
                {task.external_contact_name && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {task.external_contact_name}
                    {task.external_contact_email && ` · ${task.external_contact_email}`}
                  </span>
                )}

                {task.due_date && (
                  <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {format(new Date(task.due_date), "dd.MM.yyyy", { locale: de })}
                    {isOverdue && " (überfällig)"}
                  </span>
                )}

                <button
                  onClick={() => setDetailOpen(true)}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Protokoll anzeigen"
                >
                  <Clock className="h-3 w-3" />
                  {format(new Date(task.created_at), "dd.MM.yy, HH:mm", { locale: de })}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <TaskDetailSheet task={task} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
};
