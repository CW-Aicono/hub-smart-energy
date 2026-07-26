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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, Receipt, Landmark, Save, FileText, Activity } from "lucide-react";
import { toast } from "sonner";
import { LegalPagesSettings } from "@/components/settings/LegalPagesSettings";

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

          <Tabs defaultValue="company">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="company" className="gap-2">
                <Building2 className="h-4 w-4" />
                Unternehmen
              </TabsTrigger>
              <TabsTrigger value="legal" className="gap-2">
                <FileText className="h-4 w-4" />
                Rechtliches
              </TabsTrigger>
              <TabsTrigger value="sensor-history" className="gap-2">
                <Activity className="h-4 w-4" />
                Sensor-Historie
              </TabsTrigger>
            </TabsList>

            <TabsContent value="company">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-6 mt-4">
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
            </TabsContent>

            <TabsContent value="legal">
              <div className="mt-4">
                <LegalPagesSettings />
              </div>
            </TabsContent>

            <TabsContent value="sensor-history">
              <div className="mt-4">
                <SensorHistorySettings />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* Sensor-Historie: Kill-Switch + Live-Zähler              */
/* ─────────────────────────────────────────────────────── */
function SensorHistorySettings() {
  const queryClient = useQueryClient();

  const { data: setting, isLoading } = useQuery({
    queryKey: ["system_settings", "sensor_history_enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "sensor_history_enabled")
        .maybeSingle();
      const raw = String((data as any)?.value ?? "true").toLowerCase();
      return raw !== "false" && raw !== "0" && raw !== "off";
    },
  });

  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
  const since1h = new Date(Date.now() - 3600_000).toISOString();

  const { data: counts } = useQuery({
    queryKey: ["sensor-history-counts"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [raw24, raw1, agg24] = await Promise.all([
        supabase.from("sensor_readings_raw").select("id", { count: "exact", head: true }).gte("recorded_at", since24h),
        supabase.from("sensor_readings_raw").select("id", { count: "exact", head: true }).gte("recorded_at", since1h),
        supabase.from("sensor_readings_5min").select("id", { count: "exact", head: true }).gte("bucket", since24h),
      ]);
      return {
        raw24: raw24.count ?? 0,
        raw1: raw1.count ?? 0,
        agg24: agg24.count ?? 0,
      };
    },
  });

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("system_settings")
        .upsert({ key: "sensor_history_enabled", value: enabled ? "true" : "false" }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_settings", "sensor_history_enabled"] });
      toast.success("Einstellung gespeichert");
    },
    onError: (e: any) => toast.error(`Fehler: ${e.message}`),
  });

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5" /> Sensor-Historie
          </CardTitle>
          <CardDescription>
            Historisierung von Momentanwerten (Temperatur, Feuchte, Spannung, Batterien …).
            Notfall-Kill-Switch bei IO-Druck.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-medium">Aufzeichnung aktiv</div>
              <div className="text-xs text-muted-foreground">
                Wenn deaktiviert, werden keine neuen Rohwerte mehr geschrieben und der 5-Minuten-Aggregator läuft leer.
              </div>
            </div>
            <Switch
              checked={!!setting}
              disabled={isLoading || toggle.isPending}
              onCheckedChange={(v) => toggle.mutate(v)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 border rounded-lg">
              <div className="text-xs text-muted-foreground">Rohwerte (letzte Stunde)</div>
              <div className="text-2xl font-bold tabular-nums">{(counts?.raw1 ?? 0).toLocaleString("de-DE")}</div>
            </div>
            <div className="p-3 border rounded-lg">
              <div className="text-xs text-muted-foreground">Rohwerte (24 h)</div>
              <div className="text-2xl font-bold tabular-nums">{(counts?.raw24 ?? 0).toLocaleString("de-DE")}</div>
            </div>
            <div className="p-3 border rounded-lg">
              <div className="text-xs text-muted-foreground">5-Min-Buckets (24 h)</div>
              <div className="text-2xl font-bold tabular-nums">{(counts?.agg24 ?? 0).toLocaleString("de-DE")}</div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <div><b>Retention:</b> Rohdaten 7 Tage · 5-Min 400 Tage · Stunden 2 Jahre · Tage 5 Jahre · Monate unbegrenzt.</div>
            <div><b>Aggregation:</b> zeit-gewichteter Mittelwert + Min + Max + Letzter Wert.</div>
            <div><b>Ingest-Pfade:</b> AICONO Gateway (device-snapshot), Shelly Cloud, Loxone.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
