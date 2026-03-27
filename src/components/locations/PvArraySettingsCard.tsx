import { useState, useEffect } from "react";
import { PvForecastSettings } from "@/hooks/usePvForecast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Save, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface Meter {
  id: string;
  name: string;
}

interface PvArraySettingsCardProps {
  initial?: PvForecastSettings | null;
  solarMeters: Meter[];
  onSave: (values: {
    id?: string;
    name: string;
    peak_power_kwp: number;
    tilt_deg: number;
    azimuth_deg: number;
    performance_ratio: number;
    pv_meter_id: string | null;
    is_active: boolean;
  }) => void;
  onDelete?: () => void;
  saving?: boolean;
  index: number;
}

export function PvArraySettingsCard({ initial, solarMeters, onSave, onDelete, saving, index }: PvArraySettingsCardProps) {
  const { t } = useTranslation();
  const T = (key: string) => t(key as any);

  const [form, setForm] = useState({
    name: initial?.name ?? `Anlage ${index + 1}`,
    peak_power_kwp: initial?.peak_power_kwp ?? 10,
    tilt_deg: initial?.tilt_deg ?? 30,
    azimuth_deg: initial?.azimuth_deg ?? 180,
    performance_ratio: initial?.performance_ratio ?? 0.8,
    pv_meter_id: initial?.pv_meter_id ?? "",
    is_active: initial?.is_active ?? true,
  });

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name ?? `Anlage ${index + 1}`,
        peak_power_kwp: initial.peak_power_kwp,
        tilt_deg: initial.tilt_deg,
        azimuth_deg: initial.azimuth_deg,
        performance_ratio: initial.performance_ratio ?? 0.8,
        pv_meter_id: initial.pv_meter_id || "",
        is_active: initial.is_active,
      });
    }
  }, [initial, index]);

  const handleSave = () => {
    if (form.tilt_deg < 0 || form.tilt_deg > 90) return;
    if (form.azimuth_deg < 0 || form.azimuth_deg > 360) return;
    onSave({
      id: initial?.id,
      ...form,
      pv_meter_id: form.pv_meter_id || null,
    });
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-4">
          <Label>{T("pv.arrayName")}</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={`Anlage ${index + 1}`}
            className="max-w-xs"
          />
        </div>
        {onDelete && (
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label className="flex items-center gap-1">{T("pv.peakPower")} <HelpTooltip text={T("tooltip.pvPeakPower")} iconSize={12} /></Label>
          <Input type="number" value={form.peak_power_kwp} onChange={(e) => setForm({ ...form, peak_power_kwp: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="flex items-center gap-1">{T("pv.tilt")} <HelpTooltip text={T("tooltip.pvTilt")} iconSize={12} /></Label>
          <Input type="number" min={0} max={90} value={form.tilt_deg} onChange={(e) => {
            const value = Number(e.target.value);
            setForm({ ...form, tilt_deg: Math.min(90, Math.max(0, value)) });
          }} />
        </div>
        <div>
          <Label className="flex items-center gap-1">{T("pv.azimuth")} <HelpTooltip text={T("tooltip.pvAzimuth")} iconSize={12} /></Label>
          <Input type="number" min={0} max={360} value={form.azimuth_deg} onChange={(e) => {
            const value = Number(e.target.value);
            setForm({ ...form, azimuth_deg: Math.min(360, Math.max(0, value)) });
          }} />
        </div>
        <div>
          <Label className="flex items-center gap-1">{T("pv.meter")} <HelpTooltip text={T("tooltip.pvMeter")} iconSize={12} /></Label>
          <Select value={form.pv_meter_id || "__none__"} onValueChange={(value) => setForm({ ...form, pv_meter_id: value === "__none__" ? "" : value })}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{T("pv.none")}</SelectItem>
              {solarMeters.map((meter) => (
                <SelectItem key={meter.id} value={meter.id}>{meter.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={(value) => setForm({ ...form, is_active: value })} />
          <Label>{T("pv.forecastActive")}</Label>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="h-4 w-4 mr-1" />
          {T("common.save")}
        </Button>
      </div>
    </div>
  );
}
