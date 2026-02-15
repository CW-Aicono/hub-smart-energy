import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const WEEKDAYS = [
  { value: "1", label: "Montag" },
  { value: "2", label: "Dienstag" },
  { value: "3", label: "Mittwoch" },
  { value: "4", label: "Donnerstag" },
  { value: "5", label: "Freitag" },
  { value: "6", label: "Samstag" },
  { value: "0", label: "Sonntag" },
];

export function WeekStartSetting() {
  const { tenant, refetch } = useTenant();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [weekStartDay, setWeekStartDay] = useState<string>(
    String(tenant?.week_start_day ?? 1)
  );

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);

    const { error } = await supabase
      .from("tenants")
      .update({ week_start_day: Number(weekStartDay) })
      .eq("id", tenant.id);

    setSaving(false);

    if (error) {
      toast({
        title: "Fehler",
        description: "Wochenbeginn konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } else {
      await refetch();
      toast({
        title: "Gespeichert",
        description: "Wochenbeginn wurde aktualisiert.",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Standardwoche
        </CardTitle>
        <CardDescription>
          Legen Sie fest, an welchem Wochentag die Woche für alle Liegenschaften, Grafiken und Berichte beginnt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="week-start">Wochenbeginn</Label>
          <Select value={weekStartDay} onValueChange={setWeekStartDay}>
            <SelectTrigger id="week-start">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((day) => (
                <SelectItem key={day.value} value={day.value}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Wird gespeichert..." : "Speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
