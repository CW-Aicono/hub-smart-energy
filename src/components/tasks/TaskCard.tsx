import { useState } from "react";
import { useTasks, Task, TaskStatus, useTaskHistory } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  MoreHorizontal, User, ExternalLink, Zap, AlertTriangle, PlugZap,
  Clock, CheckCircle2, Circle, ArrowRight, XCircle, CalendarDays, Trash2,
  History, MessageSquare, ArrowLeftRight, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";

const PRIORITY_CONFIG = {
  low: { label: "Niedrig", color: "bg-secondary text-secondary-foreground border-border" },
  medium: { label: "Mittel", color: "bg-muted text-muted-foreground border-border" },
  high: { label: "Hoch", color: "bg-primary/10 text-primary border-primary/20" },
  critical: { label: "Kritisch", color: "bg-destructive/15 text-destructive border-destructive/20" },
};

const STATUS_CONFIG = {
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

const ACTION_LABELS: Record<string, string> = {
  created: "Aufgabe erstellt",
  status_changed: "Status geändert",
  assigned: "Zugewiesen",
  transferred: "Übergeben an",
  comment: "Kommentar",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Erledigt",
  cancelled: "Abgebrochen",
};

interface TaskCardProps {
  task: Task;
}

// ---- Transfer Dialog ----
const TransferDialog = ({ task, open, onOpenChange }: { task: Task; open: boolean; onOpenChange: (v: boolean) => void }) => {
  const { updateTask, tenantUsers } = useTasks();
  const [tab, setTab] = useState<"team" | "external">("team");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [externalName, setExternalName] = useState(task.external_contact_name ?? "");
  const [externalEmail, setExternalEmail] = useState(task.external_contact_email ?? "");
  const [externalPhone, setExternalPhone] = useState(task.external_contact_phone ?? "");
  const [note, setNote] = useState("");

  const handleTransfer = async () => {
    if (tab === "team") {
      const selectedUser = tenantUsers.find((u) => u.user_id === selectedUserId);
      const newName = selectedUser?.contact_person ?? selectedUser?.email ?? selectedUserId;
      await updateTask.mutateAsync({
        id: task.id,
        assigned_to: selectedUserId,
        assigned_to_name: newName,
        external_contact_name: null,
        external_contact_email: null,
        external_contact_phone: null,
        historyAction: "transferred",
        historyOldValue: task.assigned_to_name ?? task.external_contact_name ?? "—",
        historyNewValue: newName,
        historyComment: note || null,
      });
    } else {
      await updateTask.mutateAsync({
        id: task.id,
        assigned_to: null,
        assigned_to_name: null,
        external_contact_name: externalName || null,
        external_contact_email: externalEmail || null,
        external_contact_phone: externalPhone || null,
        historyAction: "transferred",
        historyOldValue: task.assigned_to_name ?? task.external_contact_name ?? "—",
        historyNewValue: externalName,
        historyComment: note || null,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" /> Aufgabe übergeben
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "team" | "external")}>
            <TabsList className="w-full">
              <TabsTrigger value="team" className="flex-1 gap-1.5"><User className="h-3.5 w-3.5" /> Intern</TabsTrigger>
              <TabsTrigger value="external" className="flex-1 gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> Extern</TabsTrigger>
            </TabsList>
            <TabsContent value="team" className="mt-3">
              <Label className="text-xs mb-1.5 block">Benutzer auswählen</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Benutzer wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {tenantUsers.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.contact_person ? `${u.contact_person} (${u.email})` : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
            <TabsContent value="external" className="mt-3 space-y-2">
              <Input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Name des Dienstleisters..." />
              <Input value={externalEmail} onChange={(e) => setExternalEmail(e.target.value)} placeholder="E-Mail..." type="email" />
              <Input value={externalPhone} onChange={(e) => setExternalPhone(e.target.value)} placeholder="Telefon..." type="tel" />
            </TabsContent>
          </Tabs>
          <div className="space-y-1.5">
            <Label className="text-xs">Hinweis (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Übergabenotiz..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleTransfer} disabled={updateTask.isPending || (tab === "team" && !selectedUserId)}>
            <ArrowLeftRight className="h-4 w-4 mr-2" /> Übergeben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---- Detail / History Dialog ----
const TaskDetailDialog = ({ task, open, onOpenChange }: { task: Task; open: boolean; onOpenChange: (v: boolean) => void }) => {
  const { data: history = [], isLoading } = useTaskHistory(task.id);
  const { addComment } = useTasks();
  const [comment, setComment] = useState("");

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    await addComment.mutateAsync({ taskId: task.id, comment });
    setComment("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Aufgabenprotokoll
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">{task.title}</p>
        </DialogHeader>

        <ScrollArea className="max-h-80 pr-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-6">Lädt...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Noch keine Einträge.</p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center shrink-0",
                      entry.action === "comment" ? "bg-muted" : "bg-primary/10"
                    )}>
                      {entry.action === "comment"
                        ? <MessageSquare className="h-3 w-3 text-muted-foreground" />
                        : <Clock className="h-3 w-3 text-primary" />}
                    </div>
                    <div className="w-px flex-1 bg-border mt-1" />
                  </div>
                  <div className="pb-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">
                        {entry.actor_name ?? "System"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), "dd.MM.yy, HH:mm", { locale: de })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                      {entry.action === "status_changed" && entry.old_value && entry.new_value &&
                        <>: <span className="line-through">{STATUS_LABELS[entry.old_value] ?? entry.old_value}</span> → <span className="font-medium text-foreground">{STATUS_LABELS[entry.new_value] ?? entry.new_value}</span></>
                      }
                      {entry.action === "transferred" && entry.new_value &&
                        <>: <span className="font-medium text-foreground">{entry.new_value}</span></>
                      }
                    </p>
                    {entry.comment && (
                      <p className="text-xs mt-1 bg-muted rounded px-2 py-1">{entry.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />

        <div className="flex gap-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Kommentar hinzufügen..."
            rows={2}
            className="flex-1 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleAddComment(); }}
          />
          <Button size="icon" onClick={handleAddComment} disabled={!comment.trim() || addComment.isPending} className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---- Main TaskCard ----
export const TaskCard = ({ task }: TaskCardProps) => {
  const { updateTask, deleteTask } = useTasks();
  const [transferOpen, setTransferOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const StatusIcon = STATUS_CONFIG[task.status]?.icon ?? Circle;
  const SourceIcon = SOURCE_ICONS[task.source_type] ?? User;
  const priorityCfg = PRIORITY_CONFIG[task.priority];
  const statusCfg = STATUS_CONFIG[task.status];

  const isOverdue = task.due_date && task.status !== "done" && task.status !== "cancelled"
    && new Date(task.due_date) < new Date();

  const handleStatusChange = (status: TaskStatus) => {
    updateTask.mutate({
      id: task.id,
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      historyAction: "status_changed",
      historyOldValue: task.status,
      historyNewValue: status,
    });
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
                <p className={cn("font-medium text-sm leading-snug", task.status === "done" && "line-through text-muted-foreground")}>
                  {task.title}
                </p>
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
                    <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                      <ArrowLeftRight className="h-4 w-4 mr-2" /> Übergeben
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
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
                  onClick={() => setHistoryOpen(true)}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Protokoll anzeigen"
                >
                  <Clock className="h-3 w-3" />
                  {format(new Date(task.created_at), "dd.MM.yy", { locale: de })}
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <TransferDialog task={task} open={transferOpen} onOpenChange={setTransferOpen} />
      <TaskDetailDialog task={task} open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
};
