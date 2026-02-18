import { useState } from "react";
import { useTasks, Task, TaskStatus, useTaskHistory } from "@/hooks/useTasks";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User, ExternalLink, Zap, AlertTriangle, PlugZap,
  Clock, CheckCircle2, Circle, ArrowRight, XCircle, CalendarDays,
  History, MessageSquare, ArrowLeftRight, Send, Pencil, Check, X,
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

interface TaskDetailSheetProps {
  task: Task;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const TaskDetailSheet = ({ task, open, onOpenChange }: TaskDetailSheetProps) => {
  const { updateTask, addComment, tenantUsers } = useTasks();
  const { data: history = [], isLoading: historyLoading } = useTaskHistory(task.id);

  // Comment
  const [comment, setComment] = useState("");

  // Edit title/description inline
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description ?? "");

  // Transfer state
  const [transferTab, setTransferTab] = useState<"team" | "external">("team");
  const [selectedUserId, setSelectedUserId] = useState(task.assigned_to ?? "");
  const [externalName, setExternalName] = useState(task.external_contact_name ?? "");
  const [externalEmail, setExternalEmail] = useState(task.external_contact_email ?? "");
  const [externalPhone, setExternalPhone] = useState(task.external_contact_phone ?? "");
  const [transferNote, setTransferNote] = useState("");
  const [transferSaved, setTransferSaved] = useState(false);

  const SourceIcon = SOURCE_ICONS[task.source_type] ?? User;
  const priorityCfg = PRIORITY_CONFIG[task.priority];
  const statusCfg = STATUS_CONFIG[task.status];
  const StatusIcon = statusCfg.icon;

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

  const handleSaveTitle = () => {
    if (titleDraft.trim() && titleDraft !== task.title) {
      updateTask.mutate({ id: task.id, title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  const handleSaveDesc = () => {
    if (descDraft !== (task.description ?? "")) {
      updateTask.mutate({ id: task.id, description: descDraft || null });
    }
    setEditingDesc(false);
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    await addComment.mutateAsync({ taskId: task.id, comment });
    setComment("");
  };

  const handleTransfer = async () => {
    if (transferTab === "team") {
      const user = tenantUsers.find((u) => u.user_id === selectedUserId);
      const newName = user?.contact_person ?? user?.email ?? selectedUserId;
      await updateTask.mutateAsync({
        id: task.id,
        assigned_to: selectedUserId || null,
        assigned_to_name: selectedUserId ? newName : null,
        external_contact_name: null,
        external_contact_email: null,
        external_contact_phone: null,
        historyAction: "transferred",
        historyOldValue: task.assigned_to_name ?? task.external_contact_name ?? "—",
        historyNewValue: newName,
        historyComment: transferNote || null,
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
        historyComment: transferNote || null,
      });
    }
    setTransferNote("");
    setTransferSaved(true);
    setTimeout(() => setTransferSaved(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            {/* Status toggle */}
            <button
              onClick={() => {
                const next: Record<string, TaskStatus> = {
                  open: "in_progress", in_progress: "done", done: "open", cancelled: "open",
                };
                handleStatusChange(next[task.status] as TaskStatus);
              }}
              className={cn("mt-1 shrink-0 transition-colors hover:scale-110", statusCfg.color)}
              title={`Status: ${statusCfg.label}`}
            >
              <StatusIcon className="h-5 w-5" />
            </button>

            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="h-7 text-base font-semibold"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveTitle}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditingTitle(false)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <SheetTitle
                  className={cn(
                    "text-base font-semibold leading-snug cursor-pointer hover:text-primary transition-colors flex items-center gap-1 group",
                    task.status === "done" && "line-through text-muted-foreground"
                  )}
                  onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}
                >
                  {task.title}
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
                </SheetTitle>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant="outline" className={cn("text-xs py-0", priorityCfg.color)}>
                  {priorityCfg.label}
                </Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <SourceIcon className="h-3.5 w-3.5" />
                  {task.source_label ?? SOURCE_LABELS[task.source_type]}
                </span>
                {task.due_date && (
                  <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {format(new Date(task.due_date), "dd.MM.yyyy", { locale: de })}
                    {isOverdue && " (überfällig)"}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {format(new Date(task.created_at), "dd.MM.yy", { locale: de })}
                </span>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable content */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-5 space-y-6">

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Beschreibung</Label>
              {editingDesc ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    className="text-sm"
                  />
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={handleSaveDesc}><Check className="h-3.5 w-3.5 mr-1" /> Speichern</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>Abbrechen</Button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    "text-sm rounded-md px-3 py-2 cursor-pointer group border border-transparent hover:border-border hover:bg-muted/40 transition-all min-h-9",
                    !task.description && "text-muted-foreground italic"
                  )}
                  onClick={() => { setDescDraft(task.description ?? ""); setEditingDesc(true); }}
                >
                  {task.description ?? "Beschreibung hinzufügen..."}
                  <Pencil className="h-3 w-3 inline ml-1.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                </div>
              )}
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</Label>
              <Select value={task.status} onValueChange={(v) => handleStatusChange(v as TaskStatus)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">⬜ Offen</SelectItem>
                  <SelectItem value="in_progress">🔵 In Bearbeitung</SelectItem>
                  <SelectItem value="done">✅ Erledigt</SelectItem>
                  <SelectItem value="cancelled">❌ Abgebrochen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Transfer / Assignment */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Zuweisung &amp; Übergabe
              </Label>

              {/* Current assignee info */}
              {(task.assigned_to_name || task.external_contact_name) && (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                  {task.assigned_to_name ? (
                    <>
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{task.assigned_to_name}</span>
                      <Badge variant="outline" className="text-xs py-0">Intern</Badge>
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-medium">{task.external_contact_name}</span>
                        {task.external_contact_email && (
                          <span className="text-xs text-muted-foreground">{task.external_contact_email}</span>
                        )}
                        {task.external_contact_phone && (
                          <span className="text-xs text-muted-foreground">{task.external_contact_phone}</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs py-0 ml-auto">Extern</Badge>
                    </>
                  )}
                </div>
              )}

              <Tabs value={transferTab} onValueChange={(v) => setTransferTab(v as "team" | "external")}>
                <TabsList className="w-full">
                  <TabsTrigger value="team" className="flex-1 gap-1.5 text-xs">
                    <User className="h-3.5 w-3.5" /> Intern zuweisen
                  </TabsTrigger>
                  <TabsTrigger value="external" className="flex-1 gap-1.5 text-xs">
                    <ExternalLink className="h-3.5 w-3.5" /> Extern übergeben
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="team" className="mt-3 space-y-2">
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
                  <Input
                    value={externalName}
                    onChange={(e) => setExternalName(e.target.value)}
                    placeholder="Name des Dienstleisters..."
                  />
                  <Input
                    value={externalEmail}
                    onChange={(e) => setExternalEmail(e.target.value)}
                    placeholder="E-Mail..."
                    type="email"
                  />
                  <Input
                    value={externalPhone}
                    onChange={(e) => setExternalPhone(e.target.value)}
                    placeholder="Telefon..."
                    type="tel"
                  />
                </TabsContent>
              </Tabs>

              <Textarea
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                placeholder="Übergabenotiz (optional)..."
                rows={2}
                className="text-sm"
              />

              <Button
                onClick={handleTransfer}
                disabled={updateTask.isPending || (transferTab === "team" && !selectedUserId)}
                size="sm"
                className="gap-1.5"
                variant={transferSaved ? "outline" : "default"}
              >
                {transferSaved ? (
                  <><Check className="h-3.5 w-3.5" /> Gespeichert</>
                ) : (
                  <><ArrowLeftRight className="h-3.5 w-3.5" /> Übergeben</>
                )}
              </Button>
            </div>

            <Separator />

            {/* History / Comments */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Protokoll
              </Label>

              {historyLoading ? (
                <p className="text-xs text-muted-foreground text-center py-4">Lädt...</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Noch keine Einträge.</p>
              ) : (
                <div className="space-y-0">
                  {history.map((entry, idx) => (
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
                        {idx < history.length - 1 && (
                          <div className="w-px flex-1 bg-border mt-1 mb-0 min-h-3" />
                        )}
                      </div>
                      <div className={cn("flex-1 min-w-0", idx < history.length - 1 ? "pb-3" : "pb-1")}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{entry.actor_name ?? "System"}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), "dd.MM.yy, HH:mm", { locale: de })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ACTION_LABELS[entry.action] ?? entry.action}
                          {entry.action === "status_changed" && entry.old_value && entry.new_value && (
                            <>
                              {": "}
                              <span className="line-through">{STATUS_LABELS[entry.old_value] ?? entry.old_value}</span>
                              {" → "}
                              <span className="font-medium text-foreground">{STATUS_LABELS[entry.new_value] ?? entry.new_value}</span>
                            </>
                          )}
                          {entry.action === "transferred" && entry.new_value && (
                            <>
                              {": "}
                              <span className="font-medium text-foreground">{entry.new_value}</span>
                            </>
                          )}
                        </p>
                        {entry.comment && (
                          <p className="text-xs mt-1 bg-muted rounded px-2 py-1">{entry.comment}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              <div className="flex gap-2 pt-1">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Kommentar hinzufügen... (Strg+Enter)"
                  rows={2}
                  className="flex-1 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleAddComment(); }}
                />
                <Button
                  size="icon"
                  onClick={handleAddComment}
                  disabled={!comment.trim() || addComment.isPending}
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
