import { useEffect, useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useTaskTemplates, TaskTemplate, TaskTemplateInput } from "@/hooks/useTaskTemplates";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Pencil, Trash2, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const TaskSettings = () => {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [archiveDays, setArchiveDays] = useState(7);
  const [deleteDays, setDeleteDays] = useState(90);
  const [protectExternal, setProtectExternal] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenant?.id) return;
    (async () => {
      const { data } = await supabase
        .from("tenants")
        .select("task_auto_archive_days, task_auto_delete_days, task_protect_external")
        .eq("id", tenant.id)
        .maybeSingle();
      if (data) {
        setArchiveDays((data as any).task_auto_archive_days ?? 7);
        setDeleteDays((data as any).task_auto_delete_days ?? 90);
        setProtectExternal((data as any).task_protect_external ?? true);
      }
    })();
  }, [tenant?.id]);

  const saveCleanup = async () => {
    if (!tenant?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({
        task_auto_archive_days: archiveDays,
        task_auto_delete_days: deleteDays,
        task_protect_external: protectExternal,
      } as any)
      .eq("id", tenant.id);
    setSaving(false);
    if (error) toast({ title: "Fehler beim Speichern", variant: "destructive" });
    else {
      toast({ title: "Einstellungen gespeichert" });
      qc.invalidateQueries({ queryKey: ["tenant"] });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Automatisches Aufräumen</CardTitle>
          <CardDescription>
            Erledigte und abgebrochene Aufgaben werden automatisch ins Archiv verschoben und nach
            einer weiteren Frist gelöscht. Wert „0" deaktiviert die jeweilige Aktion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Auto-Archivieren nach (Tagen)</Label>
              <Input
                type="number" min={0} max={365}
                value={archiveDays}
                onChange={(e) => setArchiveDays(Math.max(0, Number(e.target.value || 0)))}
              />
              <p className="text-xs text-muted-foreground">Standard: 7 Tage</p>
            </div>
            <div className="space-y-1.5">
              <Label>Auto-Löschen nach (Tagen, ab Archivierung)</Label>
              <Input
                type="number" min={0} max={3650}
                value={deleteDays}
                onChange={(e) => setDeleteDays(Math.max(0, Number(e.target.value || 0)))}
              />
              <p className="text-xs text-muted-foreground">Standard: 90 Tage</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={protectExternal} onCheckedChange={setProtectExternal} id="protect-ext" />
            <Label htmlFor="protect-ext" className="cursor-pointer">
              Externe Aufgaben nie automatisch löschen
            </Label>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveCleanup} disabled={saving}>Speichern</Button>
          </div>
        </CardContent>
      </Card>

      <TemplatesPanel />
    </div>
  );
};

const emptyTpl: TaskTemplateInput = {
  name: "", title: "", description: "", priority: "medium",
  default_due_offset_days: null, recurrence_rule: null, checklist: [],
};

const TemplatesPanel = () => {
  const { templates, createTemplate, updateTemplate, deleteTemplate } = useTaskTemplates();
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Aufgaben-Vorlagen</CardTitle>
          <CardDescription>
            Wiederverwendbare Vorlagen mit Titel, Priorität, Wiederholung und Checkliste. Im Dialog
            „Neue Aufgabe" können Sie aus diesen Vorlagen wählen.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Neue Vorlage
        </Button>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Vorlagen angelegt.</p>
        ) : (
          <div className="divide-y border rounded-md">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{tpl.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {tpl.title}
                    {tpl.recurrence_rule && ` • ${formatRule(tpl.recurrence_rule)}`}
                    {tpl.checklist?.length ? ` • ${tpl.checklist.length} Checklisten-Punkte` : ""}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(tpl)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => {
                    if (confirm(`Vorlage „${tpl.name}" wirklich löschen?`)) {
                      deleteTemplate.mutate(tpl.id);
                    }
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {(editing || creating) && (
        <TemplateDialog
          template={editing}
          open={!!(editing || creating)}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={async (input) => {
            if (editing) await updateTemplate.mutateAsync({ id: editing.id, ...input });
            else await createTemplate.mutateAsync(input);
            setEditing(null); setCreating(false);
          }}
        />
      )}
    </Card>
  );
};

const formatRule = (rule: string): string => {
  const [unit, intervalStr] = rule.split(":");
  const interval = Number(intervalStr) || 1;
  const map: Record<string, string> = { daily: "Tag", weekly: "Woche", monthly: "Monat" };
  if (!map[unit]) return rule;
  return interval === 1 ? `jeden ${map[unit]}` : `alle ${interval} ${map[unit]}${interval > 1 ? (unit === "monthly" ? "e" : (unit === "weekly" ? "n" : "e")) : ""}`;
};

const TemplateDialog = ({
  template, open, onClose, onSave,
}: {
  template: TaskTemplate | null;
  open: boolean;
  onClose: () => void;
  onSave: (input: TaskTemplateInput) => Promise<void>;
}) => {
  const [form, setForm] = useState<TaskTemplateInput>(
    template ? {
      name: template.name, title: template.title, description: template.description ?? "",
      priority: template.priority, default_due_offset_days: template.default_due_offset_days,
      recurrence_rule: template.recurrence_rule, checklist: template.checklist ?? [],
    } : emptyTpl,
  );
  const [checklistText, setChecklistText] = useState(
    (template?.checklist ?? []).map((c) => c.text).join("\n"),
  );
  const [recUnit, setRecUnit] = useState<string>(
    template?.recurrence_rule ? template.recurrence_rule.split(":")[0] : "none",
  );
  const [recInterval, setRecInterval] = useState<number>(
    template?.recurrence_rule ? Number(template.recurrence_rule.split(":")[1] || 1) : 1,
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name der Vorlage *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Aufgaben-Titel *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Beschreibung</Label>
            <Textarea
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priorität</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
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
              <Label>Fälligkeit in Tagen (optional)</Label>
              <Input
                type="number" min={0}
                value={form.default_due_offset_days ?? ""}
                onChange={(e) => setForm({
                  ...form,
                  default_due_offset_days: e.target.value === "" ? null : Number(e.target.value),
                })}
                placeholder="z. B. 14"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Wiederholung</Label>
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
              <p className="text-xs text-muted-foreground">Alle {recInterval} {recUnit === "daily" ? "Tag(e)" : recUnit === "weekly" ? "Woche(n)" : "Monat(e)"}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Checkliste (eine Zeile pro Punkt)</Label>
            <Textarea
              rows={4}
              value={checklistText}
              onChange={(e) => setChecklistText(e.target.value)}
              placeholder="Sichtprüfung&#10;Reinigung&#10;Test"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={async () => {
              if (!form.name.trim() || !form.title.trim()) return;
              const checklist = checklistText.split("\n").map((s) => s.trim()).filter(Boolean)
                .map((text, i) => ({ id: `c${i + 1}-${Date.now()}`, text, done: false }));
              await onSave({
                ...form,
                checklist,
                recurrence_rule: recUnit === "none" ? null : `${recUnit}:${recInterval}`,
              });
            }}
          >Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
