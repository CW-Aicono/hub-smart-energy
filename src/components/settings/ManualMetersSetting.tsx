import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function ManualMetersSetting() {
  const { tenant, refetch } = useTenant();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const enabled = tenant?.show_manual_meters ?? false;

  const handleToggle = async (checked: boolean) => {
    if (!tenant) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({ show_manual_meters: checked })
      .eq("id", tenant.id);
    setSaving(false);
    if (error) {
      toast({ title: t("common.error"), variant: "destructive" });
    } else {
      await refetch();
      toast({ title: t("common.saved") });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          {t("manualMeters.title" as any)}
        </CardTitle>
        <CardDescription>{t("manualMeters.subtitle" as any)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="show-manual-meters"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
          <Label htmlFor="show-manual-meters" className="cursor-pointer">
            {t("manualMeters.label" as any)}
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("manualMeters.explanation" as any)}
        </p>
      </CardContent>
    </Card>
  );
}
