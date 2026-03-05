import { useState } from "react";
import { useTasks, TaskStatus, TaskPriority } from "@/hooks/useTasks";
import { useExternalContacts } from "@/hooks/useExternalContacts";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trash2, X, CalendarDays, UserCheck, ArrowRight, CheckCircle2, Circle, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface BulkActionsToolbarProps {
  selectedIds: string[];
  onClearSelection: () => void;
}

export const BulkActionsToolbar = ({ selectedIds, onClearSelection }: BulkActionsToolbarProps) => {
  const { bulkUpdateFields, bulkUpdateStatus, deleteTask, tenantUsers, tasks } = useTasks();
  const { contacts: externalContacts, findMatches, createContact } = useExternalContacts();
  const { tenant } = useTenant();
  const [assignOpen, setAssignOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [assignTab, setAssignTab] = useState<"team" | "external">("team");
  const [extName, setExtName] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [extPhone, setExtPhone] = useState("");
  const [extSuggestions, setExtSuggestions] = useState<ReturnType<typeof findMatches>>([]);
  const [showExtSuggestions, setShowExtSuggestions] = useState(false);

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleStatus = (status: TaskStatus) => {
    bulkUpdateStatus.mutate({ ids: selectedIds, status });
    onClearSelection();
  };

  const handlePriority = (priority: TaskPriority) => {
    bulkUpdateFields.mutate({ ids: selectedIds, updates: { priority } });
    onClearSelection();
  };

  const handleAssignTeam = (userId: string) => {
    const user = tenantUsers.find((u) => u.user_id === userId);
    bulkUpdateFields.mutate({
      ids: selectedIds,
      updates: {
        assigned_to: userId,
        assigned_to_name: user?.contact_person || user?.email || null,
        external_contact_name: null,
        external_contact_email: null,
        external_contact_phone: null,
      },
    });
    setAssignOpen(false);
    onClearSelection();
  };

  const handleAssignExternal = () => {
    if (!extName.trim()) return;
    bulkUpdateFields.mutate({
      ids: selectedIds,
      updates: {
        assigned_to: null,
        assigned_to_name: null,
        external_contact_name: extName,
        external_contact_email: extEmail || null,
        external_contact_phone: extPhone || null,
      },
    });
    setAssignOpen(false);
    setExtName("");
    setExtEmail("");
    setExtPhone("");
    onClearSelection();
  };

  const handleDueDate = (date: Date | undefined) => {
    if (!date) return;
    bulkUpdateFields.mutate({
      ids: selectedIds,
      updates: { due_date: date.toISOString().split("T")[0] },
    });
    setDateOpen(false);
    onClearSelection();
  };

  const handleDelete = () => {
    deleteTask.mutate(selectedIds);
    onClearSelection();
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border bg-background/95 backdrop-blur shadow-lg px-4 py-3">
      <span className="text-sm font-medium mr-1">{count} ausgewählt</span>

      {/* Status */}
      <Select onValueChange={(v) => handleStatus(v as TaskStatus)}>
        <SelectTrigger className="w-auto h-8 text-xs gap-1">
          <Circle className="h-3.5 w-3.5" />
          Status
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="open"><span className="flex items-center gap-1.5"><Circle className="h-3.5 w-3.5" /> Offen</span></SelectItem>
          <SelectItem value="in_progress"><span className="flex items-center gap-1.5"><ArrowRight className="h-3.5 w-3.5" /> In Bearbeitung</span></SelectItem>
          <SelectItem value="done"><span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Erledigt</span></SelectItem>
          <SelectItem value="cancelled"><span className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" /> Abgebrochen</span></SelectItem>
        </SelectContent>
      </Select>

      {/* Priority */}
      <Select onValueChange={(v) => handlePriority(v as TaskPriority)}>
        <SelectTrigger className="w-auto h-8 text-xs gap-1">Priorität</SelectTrigger>
        <SelectContent>
          <SelectItem value="low">🟢 Niedrig</SelectItem>
          <SelectItem value="medium">🔵 Mittel</SelectItem>
          <SelectItem value="high">🟠 Hoch</SelectItem>
          <SelectItem value="critical">🔴 Kritisch</SelectItem>
        </SelectContent>
      </Select>

      {/* Assign */}
      <Popover open={assignOpen} onOpenChange={setAssignOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
            <UserCheck className="h-3.5 w-3.5" /> Zuweisen
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="center">
          <Tabs value={assignTab} onValueChange={(v) => setAssignTab(v as "team" | "external")}>
            <TabsList className="w-full">
              <TabsTrigger value="team" className="flex-1 text-xs">Team</TabsTrigger>
              <TabsTrigger value="external" className="flex-1 text-xs">Extern</TabsTrigger>
            </TabsList>
            <TabsContent value="team" className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {tenantUsers.map((u) => (
                <button
                  key={u.user_id}
                  className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent truncate"
                  onClick={() => handleAssignTeam(u.user_id)}
                >
                  {u.contact_person || u.email}
                </button>
              ))}
              {tenantUsers.length === 0 && <p className="text-xs text-muted-foreground p-2">Keine Benutzer</p>}
            </TabsContent>
            <TabsContent value="external" className="mt-2 space-y-2">
              <div><Label className="text-xs">Name *</Label><Input value={extName} onChange={(e) => setExtName(e.target.value)} className="h-8 text-xs" /></div>
              <div><Label className="text-xs">E-Mail</Label><Input value={extEmail} onChange={(e) => setExtEmail(e.target.value)} className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Telefon</Label><Input value={extPhone} onChange={(e) => setExtPhone(e.target.value)} className="h-8 text-xs" /></div>
              <Button size="sm" className="w-full h-8 text-xs" onClick={handleAssignExternal} disabled={!extName.trim()}>Zuweisen</Button>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      {/* Due Date */}
      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> Fällig
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            onSelect={handleDueDate}
            locale={de}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {/* Delete */}
      <Button variant="destructive" size="sm" className="h-8 text-xs gap-1" onClick={handleDelete}>
        <Trash2 className="h-3.5 w-3.5" /> Löschen
      </Button>

      {/* Close */}
      <Button variant="ghost" size="icon" className="h-8 w-8 ml-1" onClick={onClearSelection}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
