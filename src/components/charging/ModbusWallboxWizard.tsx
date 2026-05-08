import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Cable } from "lucide-react";

interface Template {
  id: string;
  vendor: string;
  model: string;
  default_unit_id: number;
  default_port: number;
  is_active: boolean;
}

interface Gateway {
  id: string;
  device_name: string;
  status: string;
}

interface Props {
  onCreated?: () => void;
  /** Pre-selected gateway (hides the gateway dropdown if set). */
  presetGatewayId?: string;
  /** Pre-selected location (hides the location dropdown if set). */
  presetLocationId?: string;
  /** Custom trigger label (e.g. "Wallbox anlegen"). */
  triggerLabel?: string;
}

export default function ModbusWallboxWizard({ onCreated, presetGatewayId, presetLocationId, triggerLabel }: Props) {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    template_id: "",
    gateway_id: presetGatewayId ?? "",
    location_id: presetLocationId ?? "",
    label: "",
    modbus_host: "",
    modbus_port: 502,
    unit_id: 1,
  });

  // Sync presets when they change while dialog is closed
  useEffect(() => {
    setForm((f) => ({
      ...f,
      gateway_id: presetGatewayId ?? f.gateway_id,
      location_id: presetLocationId ?? f.location_id,
    }));
  }, [presetGatewayId, presetLocationId]);

  useEffect(() => {
    if (!open || !tenant?.id) return;
    (async () => {
      const [tplRes, gwRes, locRes] = await Promise.all([
        supabase.from("wallbox_modbus_templates").select("id,vendor,model,default_unit_id,default_port,is_active").eq("is_active", true).order("vendor"),
        supabase.from("gateway_devices").select("id,device_name,status").eq("tenant_id", tenant.id).order("device_name"),
        supabase.from("locations").select("id,name").eq("tenant_id", tenant.id).order("name"),
      ]);
      setTemplates((tplRes.data ?? []) as Template[]);
      setGateways((gwRes.data ?? []) as Gateway[]);
      setLocations((locRes.data ?? []) as any);
    })();
  }, [open, tenant?.id]);

  const onTemplateChange = (id: string) => {
    const t = templates.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      template_id: id,
      modbus_port: t?.default_port ?? 502,
      unit_id: t?.default_unit_id ?? 1,
    }));
  };

  const submit = async () => {
    if (!form.template_id || !form.gateway_id || !form.modbus_host) {
      toast({ title: "Bitte alle Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.functions.invoke("wallbox-template-control/instances", {
      body: {
        ...form,
        location_id: form.location_id || null,
      },
      method: "POST",
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Wallbox angelegt", description: "Gateway wird die Bridge starten." });
    setOpen(false);
    setForm({ template_id: "", gateway_id: "", location_id: "", label: "", modbus_host: "", modbus_port: 502, unit_id: 1 });
    onCreated?.();
  };

  const testConnection = async () => {
    toast({ title: "Hinweis", description: "Test-Verbindung erfolgt erst nach dem Speichern (Gateway prüft asynchron)." });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Cable className="h-4 w-4 mr-2" />Modbus-Wallbox (Gateway)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modbus-Wallbox via Gateway anbinden</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!presetGatewayId && (
            <div>
              <Label>Gateway *</Label>
              <Select value={form.gateway_id} onValueChange={(v) => setForm({ ...form, gateway_id: v })}>
                <SelectTrigger><SelectValue placeholder="Gateway wählen" /></SelectTrigger>
                <SelectContent>
                  {gateways.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.device_name} ({g.status})</SelectItem>
                  ))}
                  {gateways.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Kein Gateway vorhanden</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Hersteller / Modell *</Label>
            <Select value={form.template_id} onValueChange={onTemplateChange}>
              <SelectTrigger><SelectValue placeholder="Template wählen" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.vendor} – {t.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Aktuell sind keine aktiven Templates verfügbar.
              </p>
            )}
          </div>

          {!presetLocationId && (
            <div>
              <Label>Standort</Label>
              <Select value={form.location_id} onValueChange={(v) => setForm({ ...form, location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Standort wählen" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Bezeichnung</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="z. B. Wallbox Carport" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label>Modbus-Host *</Label>
              <Input value={form.modbus_host} onChange={(e) => setForm({ ...form, modbus_host: e.target.value })} placeholder="192.168.1.50" />
            </div>
            <div>
              <Label>Port</Label>
              <Input type="number" value={form.modbus_port} onChange={(e) => setForm({ ...form, modbus_port: Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <Label>Unit-ID</Label>
            <Input type="number" value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: Number(e.target.value) })} />
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              Das Gateway baut nach dem Speichern eine eigene OCPP-1.6J-Verbindung pro Wallbox zum Backend auf.
              Ein passender Ladepunkt wird automatisch erstellt.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={testConnection}>Test (nach Save)</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Lege an…" : "Wallbox anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
