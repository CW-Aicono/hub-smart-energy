import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock } from "lucide-react";

interface Props {
  storage: any | null;
  onOpenChange: (open: boolean) => void;
}

/** Steuerung eines Batteriespeichers (z. B. ELMI All-in-One) über den Loxone Miniserver. */
export default function StorageControlDialog({ storage, onOpenChange }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    device_template: "", control_mode: "monitor_only", setpoint_integration_id: "",
    setpoint_control_uuid: "", min_setpoint_kw: 5, allow_self_discharge: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!storage) return;
    setForm({
      device_template: storage.device_template ?? "",
      control_mode: storage.control_mode ?? "monitor_only",
      setpoint_integration_id: storage.setpoint_integration_id ?? "",
      setpoint_control_uuid: storage.setpoint_control_uuid ?? "",
      min_setpoint_kw: Number(storage.min_setpoint_kw ?? 5),
      allow_self_discharge: !!storage.allow_self_discharge,
    });
  }, [storage]);

  const { data: integrations = [] } = useQuery({
    queryKey: ["storage-loxone-integrations", storage?.location_id],
    enabled: !!storage?.location_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_integrations")
        .select("id, custom_name, integrations(name, type)")
        .eq("location_id", storage.location_id);
      if (error) throw error;
      return (data ?? []).filter((r: any) => String(r.integrations?.type ?? "").toLowerCase().includes("loxone"));
    },
  });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("energy_storages").update({
      device_template: form.device_template || null,
      control_mode: form.control_mode,
      setpoint_integration_id: form.setpoint_integration_id || null,
      setpoint_control_uuid: form.setpoint_control_uuid.trim() || null,
      min_setpoint_kw: form.min_setpoint_kw,
      allow_self_discharge: form.allow_self_discharge,
    } as any).eq("id", storage.id).eq("tenant_id", storage.tenant_id);
    setSaving(false);
    if (error) { toast({ title: t("common.error" as any), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("storageCtl.saved" as any) });
    qc.invalidateQueries({ queryKey: ["energy-storages"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={!!storage} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("storageCtl.title" as any)}: {storage?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("storageCtl.template" as any)}</Label>
            <Select value={form.device_template || "none"} onValueChange={(v) => setForm({ ...form, device_template: v === "none" ? "" : v, min_setpoint_kw: v === "elmi_aio" ? 5 : form.min_setpoint_kw })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("storageCtl.none" as any)}</SelectItem>
                <SelectItem value="elmi_aio">ELMI Power All-in-One</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{t("storageCtl.mode" as any)}</Label>
            <Select value={form.control_mode} onValueChange={(v) => setForm({ ...form, control_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monitor_only">{t("storageCtl.monitorOnly" as any)}</SelectItem>
                <SelectItem value="pv_surplus">{t("storageCtl.pvSurplus" as any)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{t("storageCtl.integration" as any)}</Label>
            <Select value={form.setpoint_integration_id} onValueChange={(v) => setForm({ ...form, setpoint_integration_id: v })}>
              <SelectTrigger><SelectValue placeholder="–" /></SelectTrigger>
              <SelectContent>{integrations.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.custom_name || i.integrations?.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>{t("storageCtl.controlUuid" as any)}</Label>
            <Input value={form.setpoint_control_uuid} onChange={(e) => setForm({ ...form, setpoint_control_uuid: e.target.value })} placeholder="1a2b3c4d-…" />
          </div>
          <div><Label>{t("storageCtl.minKw" as any)}</Label>
            <Input type="number" min={0} value={form.min_setpoint_kw} onChange={(e) => setForm({ ...form, min_setpoint_kw: Number(e.target.value) })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label>{t("storageCtl.selfDischarge" as any)}</Label>
            <Switch checked={form.allow_self_discharge} onCheckedChange={(v) => setForm({ ...form, allow_self_discharge: v })} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
            <div>
              <Label className="flex items-center gap-1"><Lock className="h-3 w-3" />{t("storageCtl.gridDischarge" as any)}</Label>
              <p className="text-xs text-muted-foreground">{t("storageCtl.gridDischargeLocked" as any)}</p>
            </div>
            <Switch checked={false} disabled />
          </div>
          <p className="text-xs text-muted-foreground">{t("storageCtl.hint" as any)}</p>
          {storage?.last_setpoint_at && (
            <p className="text-xs">
              {t("storageCtl.lastSetpoint" as any)}: {Number(storage.last_setpoint_kw ?? 0).toLocaleString("de-DE")} kW · {new Date(storage.last_setpoint_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
              {storage.last_setpoint_error && <span className="block text-destructive">{t("storageCtl.lastError" as any)}: {storage.last_setpoint_error}</span>}
            </p>
          )}
          <Button onClick={save} disabled={saving} className="w-full">{t("common.save" as any)}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
