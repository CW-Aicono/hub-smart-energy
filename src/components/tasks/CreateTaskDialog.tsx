import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks, TaskPriority } from "@/hooks/useTasks";
import { CalendarIcon, UserIcon, ExternalLinkIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateTaskDialog = ({ open, onOpenChange }: CreateTaskDialogProps) => {
  const { createTask, tenantUsers } = useTasks();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [assigneeTab, setAssigneeTab] = useState<"team" | "external">("team");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalPhone, setExternalPhone] = useState("");

  const reset = () => {
    setTitle(""); setDescription(""); setPriority("medium"); setDueDate("");
    setSelectedUserId(""); setExternalName(""); setExternalEmail(""); setExternalPhone("");
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

    await createTask.mutateAsync({
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
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Neue Aufgabe erstellen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
