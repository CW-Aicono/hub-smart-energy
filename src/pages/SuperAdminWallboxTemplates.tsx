import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Download, Upload, Trash2, Pencil } from "lucide-react";

interface Template {
  id: string;
  vendor: string;
  model: string;
  firmware_min: string | null;
  firmware_max: string | null;
  default_unit_id: number;
  default_port: number;
  read_map: any;
  write_map: any;
  status_map: any;
  poll_intervals: any;
  notes: string | null;
  is_active: boolean;
  version: number;
  updated_at: string;
}

const EMPTY: Partial<Template> = {
  vendor: "",
  model: "",
  default_unit_id: 1,
  default_port: 502,
  read_map: [],
  write_map: {},
  status_map: {},
  poll_intervals: { fast_ms: 3000, slow_ms: 30000 },
  is_active: false,
};

export default function SuperAdminWallboxTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wallbox_modbus_templates")
      .select("*")
      .order("vendor")
      .order("model");
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      setTemplates((data ?? []) as Template[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (Object.keys(jsonErrors).length > 0) {
      toast({ title: "Ungültiges JSON", description: Object.values(jsonErrors).join(", "), variant: "destructive" });
      return;
    }
    const payload = {
      vendor: editing.vendor,
      model: editing.model,
      firmware_min: editing.firmware_min ?? null,
      firmware_max: editing.firmware_max ?? null,
      default_unit_id: Number(editing.default_unit_id) || 1,
      default_port: Number(editing.default_port) || 502,
      read_map: editing.read_map ?? [],
      write_map: editing.write_map ?? {},
      status_map: editing.status_map ?? {},
      poll_intervals: editing.poll_intervals ?? { fast_ms: 3000, slow_ms: 30000 },
      notes: editing.notes ?? null,
      is_active: !!editing.is_active,
    };
    const { error } = editing.id
      ? await supabase.from("wallbox_modbus_templates").update(payload).eq("id", editing.id)
      : await supabase.from("wallbox_modbus_templates").insert(payload);
    if (error) {
      toast({ title: "Speichern fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Gespeichert" });
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Template wirklich löschen?")) return;
    const { error } = await supabase.from("wallbox_modbus_templates").delete().eq("id", id);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    } else {
      load();
    }
  };

  const exportJson = (t: Template) => {
    const blob = new Blob([JSON.stringify(t, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.vendor}-${t.model}.template.json`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const obj = JSON.parse(await file.text());
      const { id, version, created_at, updated_at, ...rest } = obj;
      setEditing(rest);
    } catch (e) {
      toast({ title: "Import-Fehler", description: (e as Error).message, variant: "destructive" });
    }
  };

  const toggleActive = async (t: Template) => {
    const { error } = await supabase
      .from("wallbox_modbus_templates")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    if (error) toast({ title: "Fehler", description: error.message, variant: "destructive" });
    else load();
  };

  const updateJsonField = (field: keyof Template, value: string) => {
    try {
      const parsed = value.trim() === "" ? (field === "read_map" ? [] : {}) : JSON.parse(value);
      setEditing((e) => ({ ...e, [field]: parsed }));
      setJsonErrors((p) => { const n = { ...p }; delete n[field as string]; return n; });
    } catch (err) {
      setJsonErrors((p) => ({ ...p, [field as string]: `${field}: ${(err as Error).message}` }));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Wallbox Modbus-Templates</h1>
          <p className="text-sm text-muted-foreground">Hersteller-Register-Maps für die Gateway-Modbus-Bridge.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <label className="cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />JSON importieren
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
              />
            </label>
          </Button>
          <Button onClick={() => setEditing(EMPTY)}>
            <Plus className="h-4 w-4 mr-2" />Neues Template
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Lade…</p>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.vendor} {t.model}</span>
                    <Badge variant={t.is_active ? "default" : "secondary"}>
                      v{t.version} · {t.is_active ? "aktiv" : "inaktiv"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Port {t.default_port} · Unit {t.default_unit_id} ·{" "}
                    {Array.isArray(t.read_map) ? t.read_map.length : 0} Read-Register ·{" "}
                    {Object.keys(t.write_map ?? {}).length} Write-Befehle
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                  <Button variant="ghost" size="icon" onClick={() => exportJson(t)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Template bearbeiten" : "Neues Template"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vendor</Label>
                  <Input value={editing.vendor ?? ""} onChange={(e) => setEditing({ ...editing, vendor: e.target.value })} />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input value={editing.model ?? ""} onChange={(e) => setEditing({ ...editing, model: e.target.value })} />
                </div>
                <div>
                  <Label>Default Port</Label>
                  <Input type="number" value={editing.default_port ?? 502} onChange={(e) => setEditing({ ...editing, default_port: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Default Unit-ID</Label>
                  <Input type="number" value={editing.default_unit_id ?? 1} onChange={(e) => setEditing({ ...editing, default_unit_id: Number(e.target.value) })} />
                </div>
              </div>

              {(["read_map", "write_map", "status_map", "poll_intervals"] as const).map((field) => (
                <div key={field}>
                  <Label className="capitalize">{field.replace("_", " ")} (JSON)</Label>
                  <Textarea
                    rows={field === "read_map" ? 10 : 6}
                    defaultValue={JSON.stringify(editing[field] ?? (field === "read_map" ? [] : {}), null, 2)}
                    onChange={(e) => updateJsonField(field, e.target.value)}
                    className="font-mono text-xs"
                  />
                  {jsonErrors[field] && (
                    <p className="text-xs text-destructive mt-1">{jsonErrors[field]}</p>
                  )}
                </div>
              ))}

              <div>
                <Label>Notizen</Label>
                <Textarea rows={2} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={!!editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Aktiv (für Tenants verfügbar)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Abbrechen</Button>
            <Button onClick={save}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
