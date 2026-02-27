import { useState, useEffect } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useUserRole } from "@/hooks/useUserRole";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function TenantInfoSettings() {
  const { tenant, refetch } = useTenant();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: "", street: "", house_number: "", postal_code: "", city: "", contact_person: "", contact_email: "" });

  useEffect(() => {
    if (tenant) {
      setForm({ name: tenant.name || "", street: tenant.street || "", house_number: tenant.house_number || "", postal_code: tenant.postal_code || "", city: tenant.city || "", contact_person: tenant.contact_person || "", contact_email: tenant.contact_email || "" });
    }
  }, [tenant]);

  if (!isAdmin || !tenant) return null;

  const handleChange = (key: keyof typeof form, value: string) => { setForm((prev) => ({ ...prev, [key]: value })); };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("tenants").update({ name: form.name.trim() || tenant.name, street: form.street.trim() || null, house_number: form.house_number.trim() || null, postal_code: form.postal_code.trim() || null, city: form.city.trim() || null, contact_person: form.contact_person.trim() || null, contact_email: form.contact_email.trim() || null }).eq("id", tenant.id);
    setSaving(false);
    if (error) {
      toast({ title: t("common.error"), description: t("tenantInfo.saveError" as any), variant: "destructive" });
    } else {
      await refetch();
      toast({ title: t("common.saved"), description: t("tenantInfo.saved" as any) });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {t("tenantInfo.title" as any)}
        </CardTitle>
        <CardDescription>{t("tenantInfo.subtitle" as any)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="tenant-name">{t("tenantInfo.name" as any)}</Label>
          <Input id="tenant-name" value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder={t("tenantInfo.namePlaceholder" as any)} />
        </div>
        <div className="space-y-2">
          <Label>{t("tenantInfo.address" as any)}</Label>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <Input value={form.street} onChange={(e) => handleChange("street", e.target.value)} placeholder={t("tenantInfo.street" as any)} />
            <Input value={form.house_number} onChange={(e) => handleChange("house_number", e.target.value)} placeholder={t("tenantInfo.houseNumber" as any)} className="w-full sm:w-24" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
            <Input value={form.postal_code} onChange={(e) => handleChange("postal_code", e.target.value)} placeholder={t("tenantInfo.postalCode" as any)} className="w-full sm:w-28" />
            <Input value={form.city} onChange={(e) => handleChange("city", e.target.value)} placeholder={t("tenantInfo.city" as any)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("tenantInfo.contactPerson" as any)}</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={form.contact_person} onChange={(e) => handleChange("contact_person", e.target.value)} placeholder={t("tenantInfo.contactName" as any)} />
            <Input type="email" value={form.contact_email} onChange={(e) => handleChange("contact_email", e.target.value)} placeholder={t("tenantInfo.contactEmail" as any)} />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? t("common.saving" as any) : t("branding.saveChanges" as any)}
        </Button>
      </CardContent>
    </Card>
  );
}