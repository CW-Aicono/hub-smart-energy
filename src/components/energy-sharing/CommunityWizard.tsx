import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useEnergyCommunities,
  useCommunityAssets,
  useCommunityTariffs,
} from "@/hooks/useEnergyCommunities";
import { useContractTemplates } from "@/hooks/useCommunityContracts";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const STEPS = [
  "Stammdaten",
  "PLZ-Region",
  "Erste Anlage",
  "Erster Tarif",
  "Vertragsschablone",
  "Aktivierung",
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (communityId: string) => void;
}

export default function CommunityWizard({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Step data
  const [name, setName] = useState("");
  const [type, setType] = useState("nachbarschaft");
  const [regionPlz, setRegionPlz] = useState("");
  const [assetType, setAssetType] = useState("pv");
  const [assetKw, setAssetKw] = useState<number>(0);
  const [assetShare, setAssetShare] = useState("gleich");
  const [skipAsset, setSkipAsset] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [validFrom, setValidFrom] = useState(today);
  const [priceCt, setPriceCt] = useState<number>(22);
  const [feedInCt, setFeedInCt] = useState<number>(20);
  const [skipTariff, setSkipTariff] = useState(false);
  const [templateMode, setTemplateMode] = useState<"none" | "default" | "custom">("default");
  const [templateName, setTemplateName] = useState("Mitgliedervertrag Energiegemeinschaft");
  const [templateBody, setTemplateBody] = useState(DEFAULT_CONTRACT);
  const [activate, setActivate] = useState(true);

  const { createCommunity, updateCommunity } = useEnergyCommunities();
  // hooks below are only used after a community exists; we instantiate lazily on submit.
  const noopAssets = useCommunityAssets(null);
  const noopTariffs = useCommunityTariffs(null);
  const noopTemplates = useContractTemplates(null);
  void noopAssets; void noopTariffs; void noopTemplates;

  const reset = () => {
    setStep(0);
    setName(""); setType("nachbarschaft"); setRegionPlz("");
    setAssetType("pv"); setAssetKw(0); setAssetShare("gleich"); setSkipAsset(false);
    setValidFrom(today); setPriceCt(22); setFeedInCt(20); setSkipTariff(false);
    setTemplateMode("default"); setTemplateName("Mitgliedervertrag Energiegemeinschaft");
    setTemplateBody(DEFAULT_CONTRACT); setActivate(true);
  };

  const canNext = () => {
    if (step === 0) return name.trim().length > 1;
    if (step === 1) return regionPlz.trim().length > 0;
    if (step === 2) return skipAsset || assetKw > 0;
    if (step === 3) return skipTariff || (priceCt > 0 && feedInCt >= 0);
    if (step === 4) return templateMode === "none" || (templateName.trim() && templateBody.trim());
    return true;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const created = await createCommunity.mutateAsync({
        name: name.trim(),
        slug: slugify(name) + "-" + Math.random().toString(36).slice(2, 6),
        type,
        region_plz: regionPlz.split(",").map((s) => s.trim()).filter(Boolean),
        status: activate ? "active" : "draft",
      });
      // createCommunity does not return the row – re-fetch & match on slug isn't reliable.
      // Use a follow-up insert to children via supabase client directly.
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: row } = await supabase
        .from("energy_communities")
        .select("id, tenant_id")
        .eq("name", name.trim())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!row) throw new Error("Community konnte nicht gelesen werden");
      const communityId = row.id as string;
      const tenantId = row.tenant_id as string;

      if (!skipAsset && assetKw > 0) {
        await supabase.from("community_assets").insert({
          tenant_id: tenantId, community_id: communityId,
          asset_type: assetType, capacity_kw: assetKw, share_model: assetShare,
        });
      }
      if (!skipTariff) {
        await supabase.from("community_tariffs").insert({
          tenant_id: tenantId, community_id: communityId,
          valid_from: validFrom, price_ct_kwh: priceCt, feed_in_ct_kwh: feedInCt,
        });
      }
      if (templateMode !== "none") {
        await supabase.from("community_contract_templates").insert({
          tenant_id: tenantId, community_id: communityId,
          name: templateName.trim(),
          body_markdown: templateBody,
          placeholders: ["community_name", "member_name", "member_email", "valid_from", "price_ct_kwh"],
          version: 1, is_active: true,
        });
      }
      void updateCommunity; // not needed for now
      onCreated?.(communityId);
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Energiegemeinschaft anlegen — Schritt {step + 1} / {STEPS.length}: {STEPS[step]}</DialogTitle>
        </DialogHeader>
        <Progress value={progress} className="mb-4" />

        {step === 0 && (
          <div className="space-y-3">
            <div><Label>Name der Gemeinschaft *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Bürgerenergie Musterstadt" />
            </div>
            <div><Label>Typ</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nachbarschaft">Nachbarschaft</SelectItem>
                  <SelectItem value="genossenschaft">Genossenschaft</SelectItem>
                  <SelectItem value="stadtwerk">Stadtwerk</SelectItem>
                  <SelectItem value="sonstige">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div><Label>PLZ-Bereich (kommagetrennt) *</Label>
              <Input value={regionPlz} onChange={(e) => setRegionPlz(e.target.value)} placeholder="49074, 49076, 49080" />
              <p className="text-xs text-muted-foreground mt-1">
                Nach § 42c EnWG müssen Mitglieder im gleichen Verteilnetz oder benachbarten PLZ-Bereich liegen.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Erste Erzeugungsanlage</Label>
              <Button variant="ghost" size="sm" onClick={() => setSkipAsset(!skipAsset)}>
                {skipAsset ? "Anlage eintragen" : "Später ergänzen"}
              </Button>
            </div>
            {!skipAsset && (
              <>
                <div><Label>Typ</Label>
                  <Select value={assetType} onValueChange={setAssetType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pv">PV-Anlage</SelectItem>
                      <SelectItem value="wind">Wind</SelectItem>
                      <SelectItem value="chp">BHKW</SelectItem>
                      <SelectItem value="storage">Speicher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Leistung (kW) *</Label>
                  <Input type="number" step="0.1" value={assetKw} onChange={(e) => setAssetKw(Number(e.target.value))} />
                </div>
                <div><Label>Verteilmodell</Label>
                  <Select value={assetShare} onValueChange={setAssetShare}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gleich">Gleiche Anteile</SelectItem>
                      <SelectItem value="nach_anteil">Nach kW-Anteil</SelectItem>
                      <SelectItem value="dynamisch">Dynamisch (Verbrauch)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Erster Gemeinschaftstarif</Label>
              <Button variant="ghost" size="sm" onClick={() => setSkipTariff(!skipTariff)}>
                {skipTariff ? "Tarif eintragen" : "Später ergänzen"}
              </Button>
            </div>
            {!skipTariff && (
              <>
                <div><Label>Gültig ab</Label>
                  <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </div>
                <div><Label>Preis Verbraucher (ct/kWh)</Label>
                  <Input type="number" step="0.01" value={priceCt} onChange={(e) => setPriceCt(Number(e.target.value))} />
                </div>
                <div><Label>Vergütung Erzeuger (ct/kWh)</Label>
                  <Input type="number" step="0.01" value={feedInCt} onChange={(e) => setFeedInCt(Number(e.target.value))} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Empfehlung Konzept: 22–28 ct Verbraucher, 18–22 ct Erzeuger, 1–2 ct Plattformgebühr.
                </p>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Badge
                variant={templateMode === "default" ? "default" : "outline"}
                className="cursor-pointer" onClick={() => { setTemplateMode("default"); setTemplateBody(DEFAULT_CONTRACT); }}
              >Standard-Vorlage</Badge>
              <Badge
                variant={templateMode === "custom" ? "default" : "outline"}
                className="cursor-pointer" onClick={() => setTemplateMode("custom")}
              >Eigene Vorlage</Badge>
              <Badge
                variant={templateMode === "none" ? "default" : "outline"}
                className="cursor-pointer" onClick={() => setTemplateMode("none")}
              >Keine Vorlage</Badge>
            </div>
            {templateMode !== "none" && (
              <>
                <div><Label>Name der Schablone</Label>
                  <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                </div>
                <div><Label>Vertragstext (Markdown, Platzhalter: <code>{"{{member_name}}"}</code> etc.)</Label>
                  <textarea
                    className="w-full min-h-[200px] rounded-md border border-input bg-background p-2 text-sm font-mono"
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    readOnly={templateMode === "default"}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Bitte Eingaben prüfen:</p>
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div><b>Name:</b> {name}</div>
              <div><b>Typ:</b> {type}</div>
              <div><b>PLZ:</b> {regionPlz || "—"}</div>
              <div><b>Anlage:</b> {skipAsset ? "—" : `${assetType}, ${assetKw} kW, ${assetShare}`}</div>
              <div><b>Tarif:</b> {skipTariff ? "—" : `${priceCt} ct / ${feedInCt} ct ab ${validFrom}`}</div>
              <div><b>Vertragsschablone:</b> {templateMode === "none" ? "—" : templateName}</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="activate" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
              <Label htmlFor="activate">Gemeinschaft direkt aktivieren (sonst „Entwurf")</Label>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" />Zurück
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!canNext() || busy} onClick={() => setStep(step + 1)}>
              Weiter<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button disabled={busy} onClick={submit}>
              <Check className="h-4 w-4 mr-1" />{busy ? "Lege an…" : "Anlegen"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DEFAULT_CONTRACT = `# Mitgliedervertrag – {{community_name}}

zwischen

**{{community_name}}** (Energiegemeinschaft nach § 42c EnWG)

und

**{{member_name}}**, E-Mail: {{member_email}}

## 1. Gegenstand
Das Mitglied tritt der Energiegemeinschaft {{community_name}} bei und bezieht bzw. liefert
Strom über das öffentliche Netz im Rahmen des gemeinsamen Strombezugs nach § 42c EnWG.

## 2. Tarif
- Verbraucherpreis: {{price_ct_kwh}} ct/kWh
- Gültig ab: {{valid_from}}

## 3. Laufzeit & Kündigung
Der Vertrag läuft unbefristet und kann mit einer Frist von einem Monat zum Monatsende
gekündigt werden.

## 4. Datenschutz
Verbrauchsdaten werden ausschließlich zur Abrechnung und Allokation innerhalb der
Energiegemeinschaft verarbeitet. Es erfolgt keine Weitergabe an Dritte.

## 5. Digitale Unterschrift
Mit der digitalen Unterschrift bestätigt das Mitglied den Inhalt dieses Vertrags.
Zeitpunkt, IP-Adresse und ein kryptografischer Hash des Vertragstexts werden zur
Beweissicherung gespeichert.
`;
