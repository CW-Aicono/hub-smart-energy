import { useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Palette, Save, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function BrandingSettings() {
  const { tenant, updateBranding, refetch } = useTenant();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [colors, setColors] = useState({
    primary_color: tenant?.branding.primary_color || "#1a365d",
    secondary_color: tenant?.branding.secondary_color || "#2d8a6e",
    accent_color: tenant?.branding.accent_color || "#f59e0b",
  });

  if (!isAdmin) return null;

  const handleColorChange = (key: keyof typeof colors, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateBranding(colors);
    setSaving(false);
    if (error) {
      toast({ title: t("common.error"), description: t("branding.saveError" as any), variant: "destructive" });
    } else {
      toast({ title: t("branding.saved" as any), description: t("branding.savedDesc" as any) });
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !tenant) return;
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${tenant.id}/logo.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('tenant-assets').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: signedData, error: signError } = await supabase.storage.from('tenant-assets').createSignedUrl(fileName, 3600);
      if (signError || !signedData?.signedUrl) throw signError ?? new Error("Signed URL failed");
      const { error: updateError } = await supabase.from('tenants').update({ logo_url: fileName }).eq('id', tenant.id);
      if (updateError) throw updateError;
      await refetch();
      toast({ title: t("branding.logoUploaded" as any), description: t("branding.logoUploadedDesc" as any) });
    } catch {
      toast({ title: t("common.error"), description: t("branding.logoUploadError" as any), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          {t("branding.title" as any)}
        </CardTitle>
        <CardDescription>{t("branding.subtitle" as any)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{t("branding.logo" as any)}</Label>
          <div className="flex items-center gap-4">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={t("branding.currentLogo" as any)} className="h-12 w-12 object-contain rounded-lg border" />
            ) : (
              <div className="h-12 w-12 bg-muted rounded-lg flex items-center justify-center">
                <Palette className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <Input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} className="hidden" id="logo-upload" />
              <Button asChild variant="outline" size="sm" disabled={uploading}>
                <label htmlFor="logo-upload" className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? t("branding.uploading" as any) : t("branding.uploadLogo" as any)}
                </label>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="primary">{t("branding.primaryColor" as any)}</Label>
            <div className="flex gap-2">
              <Input type="color" id="primary" value={colors.primary_color} onChange={(e) => handleColorChange("primary_color", e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
              <Input type="text" value={colors.primary_color} onChange={(e) => handleColorChange("primary_color", e.target.value)} className="flex-1 font-mono text-sm" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="secondary">{t("branding.secondaryColor" as any)}</Label>
            <div className="flex gap-2">
              <Input type="color" id="secondary" value={colors.secondary_color} onChange={(e) => handleColorChange("secondary_color", e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
              <Input type="text" value={colors.secondary_color} onChange={(e) => handleColorChange("secondary_color", e.target.value)} className="flex-1 font-mono text-sm" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="accent">{t("branding.accentColor" as any)}</Label>
            <div className="flex gap-2">
              <Input type="color" id="accent" value={colors.accent_color} onChange={(e) => handleColorChange("accent_color", e.target.value)} className="h-10 w-14 p-1 cursor-pointer" />
              <Input type="text" value={colors.accent_color} onChange={(e) => handleColorChange("accent_color", e.target.value)} className="flex-1 font-mono text-sm" />
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg border bg-muted/50">
          <p className="text-sm text-muted-foreground mb-3">{t("branding.preview" as any)}</p>
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colors.primary_color }} title={t("branding.primaryColor" as any)} />
            <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colors.secondary_color }} title={t("branding.secondaryColor" as any)} />
            <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: colors.accent_color }} title={t("branding.accentColor" as any)} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? t("branding.saving" as any) : t("branding.saveChanges" as any)}
        </Button>
      </CardContent>
    </Card>
  );
}