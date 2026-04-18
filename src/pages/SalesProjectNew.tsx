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
    kunde_typ: "standard",
    kontakt_name: "",
    kontakt_email: "",
    kontakt_telefon: "",
    adresse: "",
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
        kunde_typ: form.kunde_typ,
        kontakt_name: form.kontakt_name.trim() || null,
        kontakt_email: form.kontakt_email.trim() || null,
        kontakt_telefon: form.kontakt_telefon.trim() || null,
        adresse: form.adresse.trim() || null,
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
              <Label htmlFor="kunde_typ">Kundentyp</Label>
              <select
                id="kunde_typ"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.kunde_typ}
                onChange={(e) => setForm({ ...form, kunde_typ: e.target.value })}
              >
                <option value="standard">Standard (Gewerbe / Kommune)</option>
                <option value="industry">Industrie</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Steuert die Modul-Preise im Angebot.
              </p>
            </div>
            <div>
              <Label htmlFor="kontakt_name">Ansprechpartner</Label>
              <Input
                id="kontakt_name"
                value={form.kontakt_name}
                onChange={(e) => setForm({ ...form, kontakt_name: e.target.value })}
                placeholder="z. B. Hr. Müller"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="kontakt_email">E-Mail</Label>
                <Input
                  id="kontakt_email"
                  type="email"
                  value={form.kontakt_email}
                  onChange={(e) => setForm({ ...form, kontakt_email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="kontakt_telefon">Telefon</Label>
                <Input
                  id="kontakt_telefon"
                  value={form.kontakt_telefon}
                  onChange={(e) => setForm({ ...form, kontakt_telefon: e.target.value })}
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
              <Label htmlFor="adresse">Adresse</Label>
              <Textarea
                id="adresse"
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                placeholder="Straße, PLZ, Ort"
                rows={2}
              />
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
