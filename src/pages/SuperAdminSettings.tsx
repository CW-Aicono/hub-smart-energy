import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSATranslation } from "@/hooks/useSATranslation";
import SuperAdminSidebar from "@/components/super-admin/SuperAdminSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Building2, MapPin, Receipt, Landmark, Save } from "lucide-react";
import { toast } from "sonner";

interface CompanyInfo {
  company_name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  tax_number: string;
  tax_id: string;
  bank_name: string;
  iban: string;
  bic: string;
  sepa_creditor_id: string;
}

const EMPTY: CompanyInfo = {
  company_name: "", street: "", house_number: "", postal_code: "", city: "", country: "Deutschland",
  tax_number: "", tax_id: "",
  bank_name: "", iban: "", bic: "", sepa_creditor_id: "",
};

export default function SuperAdminSettings() {
  const { t } = useSATranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CompanyInfo>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings", "company_info"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("*")
        .eq("key", "company_info")
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data?.value && typeof data.value === "object") {
      setForm({ ...EMPTY, ...(data.value as Record<string, string>) });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("platform_settings")
        .update({ value: form as any })
        .eq("key", "company_info");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-settings", "company_info"] });
      toast.success("Einstellungen gespeichert");
    },
    onError: () => toast.error("Fehler beim Speichern"),
  });

  const set = (key: keyof CompanyInfo, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex min-h-screen w-full">
      <SuperAdminSidebar />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">{t("nav.settings")}</h1>
            <p className="text-muted-foreground">Unternehmensdaten, Steuernummern und Bankverbindung für Rechnungen und SEPA-Lastschriften.</p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-6">
              {/* Company */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5" /> Firma
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Firmenname</Label>
                    <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Muster GmbH" />
                  </div>
                </CardContent>
              </Card>

              {/* Address */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="h-5 w-5" /> Anschrift
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                    <div className="space-y-2">
                      <Label>Straße</Label>
                      <Input value={form.street} onChange={(e) => set("street", e.target.value)} placeholder="Musterstraße" />
                    </div>
                    <div className="space-y-2">
                      <Label>Nr.</Label>
                      <Input value={form.house_number} onChange={(e) => set("house_number", e.target.value)} placeholder="1" className="w-full sm:w-24" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-3">
                    <div className="space-y-2">
                      <Label>PLZ</Label>
                      <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="12345" className="w-full sm:w-28" />
                    </div>
                    <div className="space-y-2">
                      <Label>Stadt</Label>
                      <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Musterstadt" />
                    </div>
                    <div className="space-y-2">
                      <Label>Land</Label>
                      <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Deutschland" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tax */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Receipt className="h-5 w-5" /> Steuerdaten
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Steuernummer</Label>
                      <Input value={form.tax_number} onChange={(e) => set("tax_number", e.target.value)} placeholder="123/456/78901" />
                    </div>
                    <div className="space-y-2">
                      <Label>USt-IdNr.</Label>
                      <Input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} placeholder="DE123456789" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Bank */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Landmark className="h-5 w-5" /> Bankverbindung & SEPA
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Kreditinstitut</Label>
                    <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="Sparkasse Musterstadt" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>IBAN</Label>
                      <Input value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="DE89 3704 0044 0532 0130 00" />
                    </div>
                    <div className="space-y-2">
                      <Label>BIC</Label>
                      <Input value={form.bic} onChange={(e) => set("bic", e.target.value)} placeholder="COBADEFFXXX" />
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Gläubiger-Identifikationsnummer (CI)</Label>
                    <Input value={form.sepa_creditor_id} onChange={(e) => set("sepa_creditor_id", e.target.value)} placeholder="DE98ZZZ09999999999" />
                    <p className="text-xs text-muted-foreground">Wird für SEPA-Lastschriften benötigt. Erhältlich über die Deutsche Bundesbank.</p>
                  </div>
                </CardContent>
              </Card>

              <Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Speichere..." : "Einstellungen speichern"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
