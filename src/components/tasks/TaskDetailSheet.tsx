import { useState, useEffect, useRef } from "react";
import { useTasks, Task, TaskStatus, useTaskHistory } from "@/hooks/useTasks";
import { useExternalContacts } from "@/hooks/useExternalContacts";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
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
import { de, enUS, es, nl } from "date-fns/locale";
import { useTranslation } from "@/hooks/useTranslation";
import type { Locale } from "date-fns";

const dfLocaleMap: Record<string, Locale> = { de, en: enUS, es, nl };

const PRIORITY_KEYS: Record<string, string> = {
  low: "task.priorityLow",
  medium: "task.priorityMedium",
  high: "task.priorityHigh",
  critical: "task.priorityCritical",
};

const PRIORITY_DOTS: Record<string, string> = {
  low: "🟢", medium: "🔵", high: "🟠", critical: "🔴",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  medium: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  critical: "bg-destructive/15 text-destructive border-destructive/20",
};

const STATUS_KEYS: Record<TaskStatus, string> = {
  open: "task.statusOpen",
  in_progress: "task.statusInProgress",
  done: "task.statusDone",
  cancelled: "task.statusCancelled",
};

const STATUS_ICONS: Record<TaskStatus, React.ElementType> = {
  open: Circle, in_progress: ArrowRight, done: CheckCircle2, cancelled: XCircle,
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  open: "text-muted-foreground",
  in_progress: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
  cancelled: "text-muted-foreground",
};

const SOURCE_ICONS: Record<string, React.ElementType> = {
  manual: User, alert: AlertTriangle, charging: PlugZap, automation: Zap,
};

const SOURCE_KEYS: Record<string, string> = {
  manual: "task.sourceManual", alert: "task.sourceAlert", charging: "task.sourceCharging", automation: "task.sourceAutomation",
};

const ACTION_KEYS: Record<string, string> = {
  created: "task.actionCreated", status_changed: "task.actionStatusChanged",
  assigned: "task.actionAssigned", transferred: "task.actionTransferred", comment: "task.actionComment",
};

interface TaskDetailSheetProps {
  task: Task;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export const TaskDetailSheet = ({ task, open, onOpenChange }: TaskDetailSheetProps) => {
  const { updateTask, addComment, tenantUsers } = useTasks();
  const { data: history = [], isLoading: historyLoading } = useTaskHistory(task.id);
  const { t, language } = useTranslation();
  const T = (key: string) => t(key as any);
  const dateLocale = dfLocaleMap[language] || de;

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
  const priorityColor = PRIORITY_COLORS[task.priority];
  const StatusIcon = STATUS_ICONS[task.status];
  const statusColor = STATUS_COLORS[task.status];

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
              className={cn("mt-1 shrink-0 transition-colors hover:scale-110", statusColor)}
              title={`Status: ${T(STATUS_KEYS[task.status])}`}
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
                <Badge variant="outline" className={cn("text-xs py-0", priorityColor)}>
                  {T(PRIORITY_KEYS[task.priority])}
                </Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <SourceIcon className="h-3.5 w-3.5" />
                  {task.source_label ?? T(SOURCE_KEYS[task.source_type])}
                </span>
                {task.due_date && (
                  <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {format(new Date(task.due_date), "dd.MM.yyyy", { locale: dateLocale })}
                    {isOverdue && ` (${T("task.overdue")})`}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {format(new Date(task.created_at), "dd.MM.yy, HH:mm", { locale: dateLocale })}
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
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{T("task.description")}</Label>
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
                    <Button size="sm" onClick={handleSaveDesc}><Check className="h-3.5 w-3.5 mr-1" /> {T("common.save")}</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>{T("common.cancel")}</Button>
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
                  {task.description ?? T("task.addDescription")}
                  <Pencil className="h-3 w-3 inline ml-1.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                </div>
              )}
            </div>

            {/* Status + Priority row */}
            <div className="flex gap-4 flex-wrap">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{T("task.status")}</Label>
                <Select value={task.status} onValueChange={(v) => handleStatusChange(v as TaskStatus)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">⬜ {T("task.statusOpen")}</SelectItem>
                    <SelectItem value="in_progress">🔵 {T("task.statusInProgress")}</SelectItem>
                    <SelectItem value="done">✅ {T("task.statusDone")}</SelectItem>
                    <SelectItem value="cancelled">❌ {T("task.statusCancelled")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{T("task.priority")}</Label>
                <Select
                  value={task.priority}
                  onValueChange={(v) => updateTask.mutate({ id: task.id, priority: v as Task["priority"] })}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟢 {T("task.priorityLow")}</SelectItem>
                    <SelectItem value="medium">🔵 {T("task.priorityMedium")}</SelectItem>
                    <SelectItem value="high">🟠 {T("task.priorityHigh")}</SelectItem>
                    <SelectItem value="critical">🔴 {T("task.priorityCritical")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Due date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> {T("task.dueDate")}
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  defaultValue={task.due_date ? task.due_date.slice(0, 10) : ""}
                  onChange={(e) => {
                    updateTask.mutate({
                      id: task.id,
                      due_date: e.target.value || null,
                    });
                  }}
                  className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {task.due_date && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground h-7 px-2"
                    onClick={() => updateTask.mutate({ id: task.id, due_date: null })}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> {T("common.remove")}
                  </Button>
                )}
              </div>
              {isOverdue && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {T("task.overdueWarning")}
                </p>
              )}
            </div>

            <Separator />

            {/* Transfer / Assignment */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" /> {T("task.assignmentTransfer")}
              </Label>

              {/* Current assignee info */}
              {(task.assigned_to_name || task.external_contact_name) && (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                  {task.assigned_to_name ? (
                    <>
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{task.assigned_to_name}</span>
                      <Badge variant="outline" className="text-xs py-0">{T("task.internal")}</Badge>
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
                      <Badge variant="outline" className="text-xs py-0 ml-auto">{T("task.external")}</Badge>
                    </>
                  )}
                </div>
              )}

              <Tabs value={transferTab} onValueChange={(v) => setTransferTab(v as "team" | "external")}>
                <TabsList className="w-full">
                  <TabsTrigger value="team" className="flex-1 gap-1.5 text-xs">
                    <User className="h-3.5 w-3.5" /> {T("task.assignInternal")}
                  </TabsTrigger>
                  <TabsTrigger value="external" className="flex-1 gap-1.5 text-xs">
                    <ExternalLink className="h-3.5 w-3.5" /> {T("task.transferExternal")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="team" className="mt-3 space-y-2">
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder={T("task.selectUser")} />
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
                    placeholder={T("task.serviceProvider")}
                  />
                  <Input
                    value={externalEmail}
                    onChange={(e) => setExternalEmail(e.target.value)}
                    placeholder={T("common.email") + "..."}
                    type="email"
                  />
                  <Input
                    value={externalPhone}
                    onChange={(e) => setExternalPhone(e.target.value)}
                    placeholder={T("common.phone") + "..."}
                    type="tel"
                  />
                </TabsContent>
              </Tabs>

              <Textarea
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                placeholder={T("task.transferNote")}
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
                  <><Check className="h-3.5 w-3.5" /> {T("task.saved")}</>
                ) : (
                  <><ArrowLeftRight className="h-3.5 w-3.5" /> {T("task.transfer")}</>
                )}
              </Button>
            </div>

            <Separator />

            {/* History / Comments */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> {T("task.log")}
              </Label>

              {historyLoading ? (
                <p className="text-xs text-muted-foreground text-center py-4">{T("task.logLoading")}</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">{T("task.logEmpty")}</p>
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
                            {format(new Date(entry.created_at), "dd.MM.yy, HH:mm", { locale: dateLocale })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {T(ACTION_KEYS[entry.action] ?? entry.action)}
                          {entry.action === "status_changed" && entry.old_value && entry.new_value && (
                            <>
                              {": "}
                              <span className="line-through">{T(STATUS_KEYS[entry.old_value as TaskStatus] ?? entry.old_value)}</span>
                              {" → "}
                              <span className="font-medium text-foreground">{T(STATUS_KEYS[entry.new_value as TaskStatus] ?? entry.new_value)}</span>
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
                  placeholder={T("task.addComment")}
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