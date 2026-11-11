import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Settings } from "lucide-react";
import PartnerBranding from "./PartnerBranding";
import { mergePartnerSender } from "@/lib/partnerSender";

type Address = { street?: string; zip?: string; city?: string; country?: string };
interface MasterData {
  name: string;
  legal_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  billing_address: Address | null;
  tax_number: string | null;
  vat_id: string | null;
  trade_register: string | null;
  managing_director: string | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
}

const COLS = "name,legal_name,contact_email,contact_phone,website,billing_address,tax_number,vat_id,trade_register,managing_director,bank_name,iban,bic";

function MasterDataForm() {
  const { partnerId, isPartnerAdmin } = usePartnerAccess();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<MasterData>>({});

  const { data } = useQuery({
    queryKey: ["partner-master-data", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      if (!partnerId) throw new Error("Partner fehlt");
      const { data, error } = await supabase.from("partners").select(COLS).eq("id", partnerId).single();
      if (error) throw error;
      return data as unknown as MasterData;
    },
  });
  useEffect(() => { if (data) setForm(data); }, [data]);

  const addr = (form.billing_address ?? {}) as Address;
  const setAddr = (k: keyof Address, v: string) => setForm((f) => ({ ...f, billing_address: { ...addr, [k]: v } }));
  const set = (k: keyof MasterData) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      if (!partnerId || !data || !isPartnerAdmin) throw new Error("Partner-Stammdaten nicht verfügbar");
      if (form.contact_email && !/^\S+@\S+\.\S+$/.test(form.contact_email)) throw new Error("Bitte eine gültige E-Mail-Adresse angeben");
      const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null);
      const payload = {
        legal_name: clean(form.legal_name),
        contact_email: clean(form.contact_email),
        contact_phone: clean(form.contact_phone),
        website: clean(form.website),
        billing_address: form.billing_address ?? null,
        tax_number: clean(form.tax_number),
        vat_id: clean(form.vat_id)?.toUpperCase() ?? null,
        trade_register: clean(form.trade_register),
        managing_director: clean(form.managing_director),
        bank_name: clean(form.bank_name),
        iban: clean(form.iban)?.replace(/\s+/g, "").toUpperCase() ?? null,
        bic: clean(form.bic)?.toUpperCase() ?? null,
      };
      const { data: cur, error: readError } = await supabase.from("partner_billing_settings").select("settings").eq("partner_id", partnerId).maybeSingle();
      if (readError) throw readError;
      const { error } = await supabase.from("partners").update(payload as any).eq("id", partnerId);
      if (error) throw error;
      // Rechnungsabsender der Partner-Rechnungen an Tenants mitführen (bestehende Einstellungen wie Präfix/Zahlungsziel bleiben).
      const reg = payload.trade_register ?? "";
      const cut = reg.lastIndexOf(",");
      const a = (payload.billing_address ?? {}) as Address;
      const sender = mergePartnerSender((cur?.settings as Record<string, unknown>) ?? {}, {
        company_name: payload.legal_name ?? data.name,
        street: a.street ?? "", postal_code: a.zip ?? "", city: a.city ?? "", country: a.country ?? "",
        email: payload.contact_email ?? "", phone: payload.contact_phone ?? "", website: payload.website ?? "",
        tax_number: payload.tax_number ?? "", vat_id: payload.vat_id ?? "", managing_director: payload.managing_director ?? "",
        register_court: reg ? (cut > 0 ? reg.slice(0, cut).trim() : "Handelsregister") : "",
        register_number: reg ? (cut > 0 ? reg.slice(cut + 1).trim() : reg) : "",
        bank_name: payload.bank_name ?? "", iban: payload.iban ?? "", bic: payload.bic ?? "",
      });
      const { error: sErr } = await supabase.from("partner_billing_settings")
        .upsert({ partner_id: partnerId, settings: sender, updated_at: new Date().toISOString() } as any);
      if (sErr) throw new Error("Stammdaten gespeichert, Rechnungsabsender nicht: " + sErr.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-master-data", partnerId] });
      toast({ title: "Stammdaten gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  if (!isPartnerAdmin) return <div className="text-muted-foreground">Nur Partner-Admins können die Stammdaten bearbeiten.</div>;
  if (!data) return <div className="text-muted-foreground">Lädt…</div>;

  const F = ({ label, k, placeholder }: { label: string; k: keyof MasterData; placeholder?: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={(form[k] as string) ?? ""} onChange={set(k)} placeholder={placeholder} />
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Unternehmen & Kontakt</CardTitle>
          <CardDescription>Wird beim Speichern als Absender Ihrer Rechnungen an Tenants übernommen (Kopf, Fußzeile und E-Rechnung). Bereits festgeschriebene Rechnungen bleiben unverändert.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          {F({ label: "Firmenname (rechtlich)", k: "legal_name", placeholder: data.name })}
          {F({ label: "Geschäftsführung", k: "managing_director" })}
          {F({ label: "E-Mail", k: "contact_email", placeholder: "info@firma.de" })}
          {F({ label: "Telefon", k: "contact_phone" })}
          {F({ label: "Website", k: "website", placeholder: "https://…" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Anschrift</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Straße & Hausnummer</Label>
            <Input value={addr.street ?? ""} onChange={(e) => setAddr("street", e.target.value)} />
          </div>
          <div className="space-y-2"><Label>PLZ</Label><Input value={addr.zip ?? ""} onChange={(e) => setAddr("zip", e.target.value)} /></div>
          <div className="space-y-2"><Label>Ort</Label><Input value={addr.city ?? ""} onChange={(e) => setAddr("city", e.target.value)} /></div>
          <div className="space-y-2"><Label>Land</Label><Input value={addr.country ?? ""} onChange={(e) => setAddr("country", e.target.value)} placeholder="Deutschland" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Steuer & Register</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          {F({ label: "Steuernummer", k: "tax_number", placeholder: "123/456/78901" })}
          {F({ label: "USt-IdNr.", k: "vat_id", placeholder: "DE123456789" })}
          {F({ label: "Handelsregister", k: "trade_register", placeholder: "Amtsgericht …, HRB …" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bankverbindung</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          {F({ label: "Bank", k: "bank_name" })}
          {F({ label: "IBAN", k: "iban", placeholder: "DE00 0000 0000 0000 0000 00" })}
          {F({ label: "BIC", k: "bic" })}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Speichert…" : "Stammdaten speichern"}</Button>
      </div>
    </div>
  );
}

export default function PartnerSettings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "branding" ? "branding" : "stammdaten";
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-6 w-6" /> Partner-Einstellungen</h1>
        <p className="text-muted-foreground">Stammdaten und Branding Ihres Partnerunternehmens.</p>
      </header>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="stammdaten">Stammdaten</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
        </TabsList>
        <TabsContent value="stammdaten" className="mt-4"><MasterDataForm /></TabsContent>
        <TabsContent value="branding" className="mt-4 -mx-6"><PartnerBranding /></TabsContent>
      </Tabs>
    </div>
  );
}
