import { useState } from "react";
import { ChargePoint } from "@/hooks/useChargePoints";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Save, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  chargePoint: ChargePoint;
  isAdmin: boolean;
  onSave: (patch: Partial<ChargePoint>) => void;
}

export function AutoRebootSettings({ chargePoint: cp, isAdmin, onSave }: Props) {
  const [enabled, setEnabled] = useState(cp.auto_reboot_enabled ?? false);
  const [time, setTime] = useState((cp.auto_reboot_time ?? "04:00:00").slice(0, 5));
  const [type, setType] = useState<"Soft" | "Hard">(cp.auto_reboot_type ?? "Soft");
  const [skipIfCharging, setSkipIfCharging] = useState(cp.auto_reboot_skip_if_charging ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        auto_reboot_enabled: enabled,
        auto_reboot_time: `${time}:00`,
        auto_reboot_type: type,
        auto_reboot_skip_if_charging: skipIfCharging,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCcw className="h-4 w-4" />
          Automatischer Tages-Reboot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Sendet einmal pro Tag automatisch einen Neustart-Befehl an die Wallbox.
            Empfohlen für Modelle, die sich nach mehreren Tagen Laufzeit selten von
            alleine wieder mit dem Backend verbinden (z.&nbsp;B. einige Duosida-Modelle).
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <Label htmlFor="auto-reboot-enabled" className="cursor-pointer">
            Funktion aktivieren
          </Label>
          <Switch
            id="auto-reboot-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!isAdmin}
          />
        </div>

        <div className={enabled ? "space-y-4" : "space-y-4 opacity-50 pointer-events-none"}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="auto-reboot-time">Uhrzeit (Europe/Berlin)</Label>
              <Input
                id="auto-reboot-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <Label>Reboot-Art</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as "Soft" | "Hard")} className="flex gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Soft" id="reboot-soft" disabled={!isAdmin} />
                  <Label htmlFor="reboot-soft" className="cursor-pointer font-normal">Soft</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Hard" id="reboot-hard" disabled={!isAdmin} />
                  <Label htmlFor="reboot-hard" className="cursor-pointer font-normal">Hard</Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Soft ist schonender und reicht in den meisten Fällen aus. Hard entspricht
            einem Strom-Reset und sollte nur verwendet werden, wenn Soft nicht hilft.
          </p>

          <div className="flex items-start gap-2">
            <Checkbox
              id="skip-charging"
              checked={skipIfCharging}
              onCheckedChange={(c) => setSkipIfCharging(c === true)}
              disabled={!isAdmin}
            />
            <Label htmlFor="skip-charging" className="cursor-pointer font-normal text-sm leading-tight">
              Nicht rebooten, wenn die Wallbox gerade lädt
              <span className="block text-xs text-muted-foreground">
                Der Reboot wird verschoben, bis der Ladevorgang beendet ist.
              </span>
            </Label>
          </div>
        </div>

        {cp.auto_reboot_last_run_at && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            Letzter Auto-Reboot:{" "}
            <span className="font-medium">
              {format(new Date(cp.auto_reboot_last_run_at), "dd.MM.yyyy HH:mm", { locale: de })}
            </span>
          </p>
        )}

        {isAdmin && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Speichere…" : "Speichern"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
