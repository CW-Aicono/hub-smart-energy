import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const WEEKDAY_KEYS = [
  { value: "1", key: "weekday.monday" },
  { value: "2", key: "weekday.tuesday" },
  { value: "3", key: "weekday.wednesday" },
  { value: "4", key: "weekday.thursday" },
  { value: "5", key: "weekday.friday" },
  { value: "6", key: "weekday.saturday" },
  { value: "0", key: "weekday.sunday" },
];

export function WeekStartSetting() {
  const { tenant, refetch } = useTenant();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [weekStartDay, setWeekStartDay] = useState<string>(String(tenant?.week_start_day ?? 1));

  const handleSave = async () => {
    if (!tenant) return;
    setSaving(true);
    const { error } = await supabase.from("tenants").update({ week_start_day: Number(weekStartDay) }).eq("id", tenant.id);
    setSaving(false);
    if (error) {
      toast({ title: t("common.error"), description: t("weekStart.saveError" as any), variant: "destructive" });
    } else {
      await refetch();
      toast({ title: t("common.saved"), description: t("weekStart.saved" as any) });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t("weekStart.title" as any)}
        </CardTitle>
        <CardDescription>{t("weekStart.subtitle" as any)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="week-start">{t("weekStart.label" as any)}</Label>
          <Select value={weekStartDay} onValueChange={setWeekStartDay}>
            <SelectTrigger id="week-start"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEEKDAY_KEYS.map((day) => (
                <SelectItem key={day.value} value={day.value}>{t(day.key as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? t("common.saving" as any) : t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}