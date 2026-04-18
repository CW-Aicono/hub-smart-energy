import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SalesLayout } from "@/components/sales/SalesLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function SalesProjectNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    kunde_name: "",
    kunde_kontakt: "",
    kunde_email: "",
    kunde_telefon: "",
    liegenschaft_name: "",
    liegenschaft_adresse: "",
    nutzungsart: "gewerbe",
    notizen: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.kunde_name.trim()) {
      toast.error("Kundenname ist erforderlich");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_projects")
      .insert({
        partner_id: user.id,
        kunde_name: form.kunde_name.trim(),
        kunde_kontakt: form.kunde_kontakt.trim() || null,
        kunde_email: form.kunde_email.trim() || null,
        kunde_telefon: form.kunde_telefon.trim() || null,
        liegenschaft_name: form.liegenschaft_name.trim() || null,
        liegenschaft_adresse: form.liegenschaft_adresse.trim() || null,
        nutzungsart: form.nutzungsart,
        notizen: form.notizen.trim() || null,
        status: "draft",
      })
      .select("id")
      .single();
    setLoading(false);
    if (error || !data) {
      toast.error("Projekt konnte nicht angelegt werden", { description: error?.message });
      return;
    }
    toast.success("Projekt angelegt");
    navigate(`/sales/${data.id}`);
  };

  return (
    <SalesLayout title="Neues Projekt" showBack backTo="/sales">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kunde</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="kunde_name">Firma / Name *</Label>
              <Input
                id="kunde_name"
                value={form.kunde_name}
                onChange={(e) => setForm({ ...form, kunde_name: e.target.value })}
                placeholder="z. B. Müller GmbH"
                required
              />
            </div>
            <div>
              <Label htmlFor="kunde_kontakt">Ansprechpartner</Label>
              <Input
                id="kunde_kontakt"
                value={form.kunde_kontakt}
                onChange={(e) => setForm({ ...form, kunde_kontakt: e.target.value })}
                placeholder="z. B. Hr. Müller"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="kunde_email">E-Mail</Label>
                <Input
                  id="kunde_email"
                  type="email"
                  value={form.kunde_email}
                  onChange={(e) => setForm({ ...form, kunde_email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="kunde_telefon">Telefon</Label>
                <Input
                  id="kunde_telefon"
                  value={form.kunde_telefon}
                  onChange={(e) => setForm({ ...form, kunde_telefon: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liegenschaft</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="liegenschaft_name">Bezeichnung</Label>
              <Input
                id="liegenschaft_name"
                value={form.liegenschaft_name}
                onChange={(e) => setForm({ ...form, liegenschaft_name: e.target.value })}
                placeholder="z. B. Hauptwerk Berlin"
              />
            </div>
            <div>
              <Label htmlFor="liegenschaft_adresse">Adresse</Label>
              <Textarea
                id="liegenschaft_adresse"
                value={form.liegenschaft_adresse}
                onChange={(e) => setForm({ ...form, liegenschaft_adresse: e.target.value })}
                placeholder="Straße, PLZ, Ort"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="nutzungsart">Nutzungsart</Label>
              <select
                id="nutzungsart"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.nutzungsart}
                onChange={(e) => setForm({ ...form, nutzungsart: e.target.value })}
              >
                <option value="gewerbe">Gewerbe</option>
                <option value="industrie">Industrie</option>
                <option value="kommune">Kommune / Öffentlich</option>
                <option value="wohnen">Wohnen / Mehrfamilienhaus</option>
                <option value="landwirtschaft">Landwirtschaft</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notizen</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.notizen}
              onChange={(e) => setForm({ ...form, notizen: e.target.value })}
              placeholder="Termin, Gesprächsnotizen, Besonderheiten..."
              rows={3}
            />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => navigate("/sales")}>
            Abbrechen
          </Button>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Anlegen
          </Button>
        </div>
      </form>
    </SalesLayout>
  );
}
