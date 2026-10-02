import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Cable, Loader2 } from "lucide-react";

interface Instance {
  id: string;
  modbus_host: string;
  modbus_port: number;
  unit_id: number;
  label: string | null;
  provision_status: string | null;
  gateway: { id: string; name: string } | null;
  template: { vendor: string; model: string } | null;
}

interface Props {
  chargePointId: string;
  canEdit: boolean;
}

/**
 * Zeigt und bearbeitet die Modbus-Anbindung einer Wallbox (Host/Port/Unit-ID),
 * wenn der Ladepunkt über das Gateway via Modbus angebunden ist.
 * Wenn keine Modbus-Instance existiert, rendert die Komponente nichts.
 */
export default function ModbusInstancePanel({ chargePointId, canEdit }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inst, setInst] = useState<Instance | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({ modbus_host: "", modbus_port: 502, unit_id: 1, label: "" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wallbox_modbus_instances")
      .select("id, modbus_host, modbus_port, unit_id, label, provision_status, gateway:gateway_devices(id,name:device_name), template:wallbox_modbus_templates(vendor,model)")
      .eq("charge_point_id", chargePointId)
      .maybeSingle();
    setLoading(false);
    if (error) {
      console.error(error);
      return;
    }
    const i = data as unknown as Instance | null;
    setInst(i);
    if (i) {
      setForm({ modbus_host: i.modbus_host ?? "", modbus_port: i.modbus_port ?? 502, unit_id: i.unit_id ?? 1, label: i.label ?? "" });
    }
  };

  useEffect(() => { load(); }, [chargePointId]);

  const save = async () => {
    if (!inst) return;
    if (!form.modbus_host.trim()) {
      toast({ title: "Modbus-Host ist erforderlich", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.functions.invoke(`wallbox-template-control/instances/${inst.id}`, {
      body: {
        modbus_host: form.modbus_host.trim(),
        modbus_port: Number(form.modbus_port) || 502,
        unit_id: Number(form.unit_id) || 1,
        label: form.label.trim() || null,
      },
      method: "PUT",
    });
    setSaving(false);
    if (error) {
      toast({ title: "Speichern fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Modbus-Anbindung aktualisiert", description: "Gateway erhält die neuen Verbindungsdaten." });
    setEditing(false);
    load();
  };

  const test = async () => {
    if (!inst) return;
    setTesting(true);
    const { error } = await supabase.functions.invoke(`wallbox-template-control/instances/${inst.id}/test`, { method: "POST" });
    setTesting(false);
    if (error) {
      toast({ title: "Test fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Test angestoßen", description: "Das Gateway prüft die Verbindung im Hintergrund." });
  };

  if (loading) return null;
  if (!inst) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Cable className="h-4 w-4" /> Modbus-Anbindung</CardTitle>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Bearbeiten</Button>
        )}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="grid grid-cols-2 gap-y-2 text-sm max-w-xl">
            <div className="text-muted-foreground">Hersteller / Modell</div>
            <div className="font-medium">{inst.template ? `${inst.template.vendor} – ${inst.template.model}` : "—"}</div>
            <div className="text-muted-foreground">Gateway</div>
            <div className="font-medium">{inst.gateway?.name ?? "—"}</div>
            <div className="text-muted-foreground">Modbus-Host (IP)</div>
            <div className="font-medium font-mono">{inst.modbus_host}</div>
            <div className="text-muted-foreground">Port</div>
            <div className="font-medium font-mono">{inst.modbus_port}</div>
            <div className="text-muted-foreground">Unit-ID</div>
            <div className="font-medium font-mono">{inst.unit_id}</div>
            <div className="text-muted-foreground">Provisionierung</div>
            <div className="font-medium">{inst.provision_status ?? "—"}</div>
          </div>
        ) : (
          <div className="space-y-3 max-w-xl">
            <Alert>
              <AlertDescription className="text-xs">
                Diese Felder konfigurieren die Modbus-TCP-Verbindung vom AICONO-EMS-Gateway zur physischen Wallbox.
                Änderungen werden sofort an das Gateway gesendet; die Bridge wird neu gestartet.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Label>Modbus-Host (IP) *</Label>
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
            <div>
              <Label>Bezeichnung</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="z. B. Wallbox Carport" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => { setEditing(false); load(); }} disabled={saving}>Abbrechen</Button>
              <Button variant="outline" onClick={test} disabled={testing || saving}>
                {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Verbindung testen
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Speichern
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
