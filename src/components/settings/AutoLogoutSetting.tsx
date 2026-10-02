import { useEffect, useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const MINUTE_OPTIONS = [10, 20, 30, 60, 120] as const;

export function AutoLogoutSetting() {
  const { tenant, refetch } = useTenant();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(tenant?.auto_logout_enabled ?? true);
  const [minutes, setMinutes] = useState<number>(tenant?.auto_logout_minutes ?? 30);

  useEffect(() => {
    if (tenant) {
      setEnabled(tenant.auto_logout_enabled ?? true);
      setMinutes(tenant.auto_logout_minutes ?? 30);
    }
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({ auto_logout_enabled: enabled, auto_logout_minutes: minutes })
      .eq("id", tenant.id);
    setSaving(false);
    if (error) {
      toast({ title: "Fehler", description: "Auto-Logout konnte nicht gespeichert werden.", variant: "destructive" });
    } else {
      await refetch();
      toast({ title: "Gespeichert", description: "Auto-Logout-Einstellungen aktualisiert." });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogOut className="h-5 w-5" />
          Auto-Logout
        </CardTitle>
        <CardDescription>
          Legen Sie fest, ob und nach welcher Inaktivitätszeit angemeldete Nutzer automatisch abgemeldet werden.
          Der Auto-Logout greift auch, wenn der Browser zwischenzeitlich geschlossen wurde.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between max-w-md">
          <Label htmlFor="auto-logout-enabled" className="cursor-pointer">
            Auto-Logout aktiv
          </Label>
          <Switch
            id="auto-logout-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="auto-logout-minutes">Inaktivitätszeit</Label>
            <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
              <SelectTrigger id="auto-logout-minutes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MINUTE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} Minuten
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Speichere..." : "Speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
