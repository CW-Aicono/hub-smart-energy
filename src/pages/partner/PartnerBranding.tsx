import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Palette, Upload, Image as ImageIcon, Lock } from "lucide-react";

interface PartnerRow {
  id: string;
  name: string;
  slug: string;
  brand_display_name: string | null;
  support_email: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  white_label_enabled: boolean;
}

export default function PartnerBranding() {
  const { partnerId, isPartnerAdmin, loading } = usePartnerAccess();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Partial<PartnerRow>>({});
  const [uploading, setUploading] = useState(false);

  const { data: partner } = useQuery({
    queryKey: ["partner-branding", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id,name,slug,brand_display_name,support_email,logo_url,primary_color,secondary_color,accent_color,subdomain,custom_domain,white_label_enabled")
        .eq("id", partnerId!)
        .single();
      if (error) throw error;
      return data as PartnerRow;
    },
  });

  useEffect(() => {
    if (partner) setForm(partner);
  }, [partner]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        brand_display_name: form.brand_display_name ?? null,
        support_email: form.support_email ?? null,
        primary_color: form.primary_color ?? null,
        secondary_color: form.secondary_color ?? null,
        accent_color: form.accent_color ?? null,
        logo_url: form.logo_url ?? null,
      };
      const { error } = await supabase.from("partners").update(payload).eq("id", partnerId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-branding", partnerId] });
      toast({ title: "Branding gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const handleUpload = async (file: File) => {
    if (!partnerId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${partnerId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("partner-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("partner-assets").getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: pub.publicUrl }));
      toast({ title: "Logo hochgeladen", description: 'Bitte „Speichern" klicken, um zu übernehmen.' });
    } catch (e: any) {
      toast({ title: "Upload fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="p-6 text-muted-foreground">Lädt…</div>;
  if (!isPartnerAdmin) return <div className="p-6 text-muted-foreground">Nur Partner-Admins können das Branding bearbeiten.</div>;
  if (!partner) return <div className="p-6 text-muted-foreground">Kein Partner-Kontext.</div>;

  const ColorInput = ({ field, label }: { field: keyof PartnerRow; label: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={(form[field] as string) || "#1a365d"}
          onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
          className="h-10 w-16 p-1 cursor-pointer"
        />
        <Input
          value={(form[field] as string) || ""}
          onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
          placeholder="#1a365d"
        />
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Palette className="h-6 w-6" /> Branding</h1>
        <p className="text-muted-foreground">Logo, Farben und Support-Kontakt für Ihr White-Label-Portal.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardDescription>Diese Daten werden in Tenant-Logins, E-Mails und PDF-Reports verwendet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Anzeigename</Label>
              <Input
                value={form.brand_display_name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, brand_display_name: e.target.value }))}
                placeholder={partner.name}
              />
            </div>
            <div className="space-y-2">
              <Label>Support-E-Mail</Label>
              <Input
                type="email"
                value={form.support_email ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, support_email: e.target.value }))}
                placeholder="support@firma.de"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" /> Logo</CardTitle>
          <CardDescription>PNG/SVG empfohlen, max. 2 MB. Wird im Tenant-Login und in Reports angezeigt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Lade hoch…" : "Logo hochladen"}
              </Button>
              {form.logo_url && (
                <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, logo_url: null }))}>
                  Logo entfernen
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Farben</CardTitle>
          <CardDescription>Drei Markenfarben — Primärfarbe für Buttons & Links, Sekundär für Akzente, Akzent für Highlights.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <ColorInput field="primary_color" label="Primärfarbe" />
          <ColorInput field="secondary_color" label="Sekundärfarbe" />
          <ColorInput field="accent_color" label="Akzentfarbe" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Domain & White-Label</CardTitle>
          <CardDescription>Diese Einstellungen pflegt der AICONO Super-Admin.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Subdomain</p>
              <p className="font-mono">{partner.subdomain ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Custom Domain</p>
              <p className="font-mono">{partner.custom_domain ?? "—"}</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <Badge variant={partner.white_label_enabled ? "default" : "secondary"}>
              {partner.white_label_enabled ? "White-Label aktiv" : "White-Label inaktiv"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Zum Aktivieren oder Ändern bitte den Super-Admin kontaktieren.
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => partner && setForm(partner)}>Zurücksetzen</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Speichere…" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}
