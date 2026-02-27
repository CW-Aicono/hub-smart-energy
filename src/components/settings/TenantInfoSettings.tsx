import { useState, useEffect } from "react";
import { useTenant } from "@/hooks/useTenant";
import { useUserRole } from "@/hooks/useUserRole";
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
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    street: "",
    house_number: "",
    postal_code: "",
    city: "",
    contact_person: "",
    contact_email: "",
  });

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name || "",
        street: tenant.street || "",
        house_number: tenant.house_number || "",
        postal_code: tenant.postal_code || "",
        city: tenant.city || "",
        contact_person: tenant.contact_person || "",
        contact_email: tenant.contact_email || "",
      });
    }
  }, [tenant]);

  if (!isAdmin || !tenant) return null;

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("tenants")
      .update({
        name: form.name.trim() || tenant.name,
        street: form.street.trim() || null,
        house_number: form.house_number.trim() || null,
        postal_code: form.postal_code.trim() || null,
        city: form.city.trim() || null,
        contact_person: form.contact_person.trim() || null,
        contact_email: form.contact_email.trim() || null,
      })
      .eq("id", tenant.id);

    setSaving(false);

    if (error) {
      toast({
        title: "Fehler",
        description: "Mandanten-Daten konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    } else {
      await refetch();
      toast({
        title: "Gespeichert",
        description: "Mandanten-Daten wurden aktualisiert.",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Mandanten-Informationen
        </CardTitle>
        <CardDescription>
          Name, Anschrift und Hauptansprechpartner Ihres Mandanten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="tenant-name">Mandantenname</Label>
          <Input
            id="tenant-name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            placeholder="Name des Mandanten"
          />
        </div>

        {/* Address */}
        <div className="space-y-2">
          <Label>Anschrift</Label>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <Input
              value={form.street}
              onChange={(e) => handleChange("street", e.target.value)}
              placeholder="Straße"
            />
            <Input
              value={form.house_number}
              onChange={(e) => handleChange("house_number", e.target.value)}
              placeholder="Nr."
              className="w-full sm:w-24"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
            <Input
              value={form.postal_code}
              onChange={(e) => handleChange("postal_code", e.target.value)}
              placeholder="PLZ"
              className="w-full sm:w-28"
            />
            <Input
              value={form.city}
              onChange={(e) => handleChange("city", e.target.value)}
              placeholder="Stadt"
            />
          </div>
        </div>

        {/* Contact Person */}
        <div className="space-y-2">
          <Label>Hauptansprechpartner</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              value={form.contact_person}
              onChange={(e) => handleChange("contact_person", e.target.value)}
              placeholder="Name"
            />
            <Input
              type="email"
              value={form.contact_email}
              onChange={(e) => handleChange("contact_email", e.target.value)}
              placeholder="E-Mail-Adresse"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Wird gespeichert..." : "Änderungen speichern"}
        </Button>
      </CardContent>
    </Card>
  );
}
