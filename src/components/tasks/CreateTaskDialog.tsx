import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks, TaskPriority, ChecklistItem } from "@/hooks/useTasks";
import { useTaskTemplates } from "@/hooks/useTaskTemplates";
import { useTaskAttachments } from "@/hooks/useTaskAttachments";
import { CalendarIcon, UserIcon, ExternalLinkIcon, Repeat, ListChecks, Plus, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskImageGallery } from "./TaskImageGallery";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateTaskDialog = ({ open, onOpenChange }: CreateTaskDialogProps) => {
  const { createTask, tenantUsers } = useTasks();
  const { templates } = useTaskTemplates();
  const { uploadAttachment } = useTaskAttachments(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [assigneeTab, setAssigneeTab] = useState<"team" | "external">("team");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [recUnit, setRecUnit] = useState<string>("none");
  const [recInterval, setRecInterval] = useState<number>(1);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");

  const reset = () => {
    setTemplateId("");
    setTitle(""); setDescription(""); setPriority("medium"); setDueDate("");
    setSelectedUserId(""); setExternalName(""); setExternalEmail(""); setExternalPhone("");
    setPendingFiles([]); setRecUnit("none"); setRecInterval(1); setChecklist([]); setNewChecklistItem("");
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === "_none") return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTitle(tpl.title);
    setDescription(tpl.description ?? "");
    setPriority(tpl.priority);
    if (tpl.default_due_offset_days != null) {
      const d = new Date();
      d.setDate(d.getDate() + tpl.default_due_offset_days);
      setDueDate(d.toISOString().slice(0, 10));
    }
    if (tpl.recurrence_rule) {
      const [u, i] = tpl.recurrence_rule.split(":");
      setRecUnit(u);
      setRecInterval(Number(i) || 1);
    } else {
      setRecUnit("none");
    }
    setChecklist((tpl.checklist ?? []).map((c, i) => ({ ...c, id: `c${i}-${Date.now()}`, done: false })));
  };

  const addChecklistItem = () => {
    const text = newChecklistItem.trim();
    if (!text) return;
    setChecklist([...checklist, { id: `c${Date.now()}`, text, done: false }]);
    setNewChecklistItem("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let assignedTo: string | undefined;
    let assignedToName: string | undefined;

    if (assigneeTab === "team" && selectedUserId) {
      const user = tenantUsers.find((u) => u.user_id === selectedUserId);
      assignedTo = selectedUserId;
      assignedToName = user?.contact_person ?? user?.email ?? selectedUserId;
    }

    const task = await createTask.mutateAsync({
      title,
      description: description || undefined,
      priority,
      due_date: dueDate || undefined,
      assigned_to: assignedTo,
      assigned_to_name: assignedToName,
      external_contact_name: assigneeTab === "external" ? externalName || undefined : undefined,
      external_contact_email: assigneeTab === "external" ? externalEmail || undefined : undefined,
      external_contact_phone: assigneeTab === "external" ? externalPhone || undefined : undefined,
      source_type: "manual",
      recurrence_rule: recUnit === "none" ? null : `${recUnit}:${recInterval}`,
      checklist,
    });

    if (task?.id && pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        await uploadAttachment.mutateAsync({ taskId: task.id, file });
      }
    }

    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neue Aufgabe erstellen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label>Aus Vorlage erstellen (optional)</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger><SelectValue placeholder="Vorlage wählen..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Keine Vorlage —</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Titel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Aufgabentitel..." required />
          </div>
          <div className="space-y-1.5">
            <Label>Beschreibung</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optionale Beschreibung..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priorität</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">🟢 Niedrig</SelectItem>
                  <SelectItem value="medium">🟡 Mittel</SelectItem>
                  <SelectItem value="high">🟠 Hoch</SelectItem>
                  <SelectItem value="critical">🔴 Kritisch</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> Fälligkeitsdatum</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Recurrence */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><Repeat className="h-3.5 w-3.5" /> Wiederholung</Label>
            <div className="flex gap-2">
              <Select value={recUnit} onValueChange={setRecUnit}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine</SelectItem>
                  <SelectItem value="daily">Täglich</SelectItem>
                  <SelectItem value="weekly">Wöchentlich</SelectItem>
                  <SelectItem value="monthly">Monatlich</SelectItem>
                </SelectContent>
              </Select>
              {recUnit !== "none" && (
                <Input
                  type="number" min={1} max={365}
                  value={recInterval}
                  onChange={(e) => setRecInterval(Math.max(1, Number(e.target.value || 1)))}
                  className="w-24"
                />
              )}
            </div>
            {recUnit !== "none" && (
              <p className="text-xs text-muted-foreground">
                Beim Erledigen wird automatisch eine Folge­aufgabe alle {recInterval} {recUnit === "daily" ? "Tag(e)" : recUnit === "weekly" ? "Woche(n)" : "Monat(e)"} angelegt.
              </p>
            )}
          </div>

          {/* Checklist */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" /> Checkliste (optional)</Label>
            {checklist.length > 0 && (
              <ul className="space-y-1">
                {checklist.map((item, idx) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">• {item.text}</span>
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => setChecklist(checklist.filter((_, i) => i !== idx))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-1">
              <Input
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                placeholder="Neuen Punkt hinzufügen..."
              />
              <Button type="button" size="icon" variant="outline" onClick={addChecklistItem}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Images */}
          <TaskImageGallery
            taskId={null}
            pendingFiles={pendingFiles}
            onPendingFilesChange={setPendingFiles}
            compact
          />

          <div className="space-y-1.5">
            <Label>Zuweisung</Label>
            <Tabs value={assigneeTab} onValueChange={(v) => setAssigneeTab(v as "team" | "external")}>
              <TabsList className="w-full">
                <TabsTrigger value="team" className="flex-1 gap-1.5"><UserIcon className="h-3.5 w-3.5" /> Intern</TabsTrigger>
                <TabsTrigger value="external" className="flex-1 gap-1.5"><ExternalLinkIcon className="h-3.5 w-3.5" /> Extern</TabsTrigger>
              </TabsList>
              <TabsContent value="team" className="mt-2">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Benutzer auswählen (optional)..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantUsers.length === 0 && (
                      <SelectItem value="_none" disabled>Keine Benutzer gefunden</SelectItem>
                    )}
                    {tenantUsers.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.contact_person ? `${u.contact_person} (${u.email})` : u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>
              <TabsContent value="external" className="mt-2 space-y-2">
                <Input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Name des Dienstleisters..." />
                <Input value={externalEmail} onChange={(e) => setExternalEmail(e.target.value)} placeholder="E-Mail..." type="email" />
                <Input value={externalPhone} onChange={(e) => setExternalPhone(e.target.value)} placeholder="Telefon..." type="tel" />
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Abbrechen</Button>
            <Button type="submit" disabled={createTask.isPending}>Erstellen</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
