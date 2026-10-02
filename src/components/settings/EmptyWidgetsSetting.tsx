import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function EmptyWidgetsSetting() {
  const { tenant, refetch } = useTenant();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const enabled = tenant?.show_empty_widgets ?? false;

  const handleToggle = async (checked: boolean) => {
    if (!tenant) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({ show_empty_widgets: checked } as any)
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
          <LayoutDashboard className="h-5 w-5" />
          {t("emptyWidgets.title" as any)}
        </CardTitle>
        <CardDescription>{t("emptyWidgets.subtitle" as any)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="show-empty-widgets"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
          <Label htmlFor="show-empty-widgets" className="cursor-pointer">
            {t("emptyWidgets.label" as any)}
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("emptyWidgets.explanation" as any)}
        </p>
      </CardContent>
    </Card>
  );
}
