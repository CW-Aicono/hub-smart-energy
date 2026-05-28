import { useEffect, useState } from "react";
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
  "PLZ & Bilanzkreis",
  "Erste Anlage",
  "Erster Tarif",
  "Verträge (Liefer + Nutzung)",
  "Pilot-Bestätigung",
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
  const [balancingZone, setBalancingZone] = useState("");
  const [gridOperator, setGridOperator] = useState("");
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
  const [templateName, setTemplateName] = useState("Nutzungsvertrag Energiegemeinschaft");
  const [templateBody, setTemplateBody] = useState(DEFAULT_CONTRACT);
  const [createSupplyTemplate, setCreateSupplyTemplate] = useState(true);
  const [pilotAck, setPilotAck] = useState(false);
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
    setBalancingZone(""); setGridOperator("");
    setAssetType("pv"); setAssetKw(0); setAssetShare("gleich"); setSkipAsset(false);
    setValidFrom(today); setPriceCt(22); setFeedInCt(20); setSkipTariff(false);
    setTemplateMode("default"); setTemplateName("Nutzungsvertrag Energiegemeinschaft");
    setTemplateBody(DEFAULT_CONTRACT); setCreateSupplyTemplate(true);
    setPilotAck(false); setActivate(true);
  };

  const canNext = () => {
    if (step === 0) return name.trim().length > 1;
    if (step === 1) return regionPlz.trim().length > 0;
    if (step === 2) return skipAsset || assetKw > 0;
    if (step === 3) return skipTariff || (priceCt > 0 && feedInCt >= 0);
    if (step === 4) return templateMode === "none" || (templateName.trim() && templateBody.trim());
    if (step === 5) return pilotAck;
    return true;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const row = await createCommunity.mutateAsync({
        name: name.trim(),
        slug: slugify(name) + "-" + Math.random().toString(36).slice(2, 6),
        type,
        region_plz: regionPlz.split(",").map((s) => s.trim()).filter(Boolean),
        status: activate ? "active" : "draft",
      });
      const { supabase } = await import("@/integrations/supabase/client");
      if (!row) throw new Error("Community konnte nicht erstellt werden");
      const communityId = row.id as string;
      const tenantId = row.tenant_id as string;

      // Bilanzkreis + VNB + Pilot-Bestätigung nachtragen
      await supabase.from("energy_communities").update({
        balancing_zone: balancingZone || null,
        grid_operator: gridOperator || null,
        pilot_acknowledged_at: pilotAck ? new Date().toISOString() : null,
      } as any).eq("id", communityId);

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
          template_kind: "nutzung",
        } as any);

        if (createSupplyTemplate) {
          await supabase.from("community_contract_templates").insert({
            tenant_id: tenantId, community_id: communityId,
            name: "Liefervertrag (Reststrom) " + name.trim(),
            body_markdown: DEFAULT_SUPPLY_CONTRACT,
            placeholders: ["community_name", "member_name", "member_email", "rest_supplier_name", "valid_from"],
            version: 1, is_active: true,
            template_kind: "liefer",
          } as any);
        }
      }
      void updateCommunity;
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
              <PlzVnbHint plzList={regionPlz} />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <Label>Bilanzkreis</Label>
                <Input value={balancingZone} onChange={(e) => setBalancingZone(e.target.value)} placeholder="z.B. TenneT-Nord" />
                <p className="text-xs text-muted-foreground mt-1">Bis 31.05.2028: alle Mitglieder im selben Bilanzkreis.</p>
              </div>
              <div>
                <Label>Verteilnetzbetreiber</Label>
                <Input value={gridOperator} onChange={(e) => setGridOperator(e.target.value)} placeholder="z.B. Westnetz GmbH" />
              </div>
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
                <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/30">
                  <input
                    type="checkbox"
                    id="supplyTpl"
                    className="mt-1"
                    checked={createSupplyTemplate}
                    onChange={(e) => setCreateSupplyTemplate(e.target.checked)}
                  />
                  <Label htmlFor="supplyTpl" className="text-xs leading-relaxed">
                    Zusätzlich <b>Liefervertrag-Schablone</b> (Reststrom, §42c Abs. 1 Nr. 2) anlegen.
                    Empfohlen: Energy Sharing braucht beide Vertragstypen — Nutzungsvertrag (Anteil) + Liefervertrag (Reststrom).
                  </Label>
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
              <div><b>Bilanzkreis:</b> {balancingZone || "—"} / VNB: {gridOperator || "—"}</div>
              <div><b>Anlage:</b> {skipAsset ? "—" : `${assetType}, ${assetKw} kW, ${assetShare}`}</div>
              <div><b>Tarif:</b> {skipTariff ? "—" : `${priceCt} ct / ${feedInCt} ct ab ${validFrom}`}</div>
              <div><b>Verträge:</b> {templateMode === "none" ? "—" : `${templateName}${createSupplyTemplate ? " + Liefervertrag" : ""}`}</div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <input type="checkbox" id="pilot" className="mt-1" checked={pilotAck} onChange={(e) => setPilotAck(e.target.checked)} />
              <Label htmlFor="pilot" className="text-sm leading-relaxed">
                <b>Pilot-Modus bestätigen (Pflicht):</b> Energy Sharing nach §42c/§20b EnWG befindet sich noch im
                regulatorischen Aufbau (BDEW Q3-Q4 2026). Es besteht <b>keine Befreiung</b> von Netzentgelten,
                Umlagen oder Steuern. Mitglieder müssen alle Zusatzkosten tragen.
              </Label>
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

function PlzVnbHint({ plzList }: { plzList: string }) {
  const [results, setResults] = useState<Array<{ plz: string; vnb: string | null; region: string | null; fallback: boolean }>>([]);
  useEffect(() => {
    const plzs = plzList.split(",").map((s) => s.trim()).filter((s) => /^\d{5}$/.test(s));
    if (plzs.length === 0) { setResults([]); return; }
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const out: any[] = [];
      for (const plz of plzs.slice(0, 5)) {
        const { data } = await supabase.functions.invoke("community-plz-check", { body: { plz } });
        if (data) out.push(data);
      }
      if (!cancelled) setResults(out);
    })();
    return () => { cancelled = true; };
  }, [plzList]);
  if (results.length === 0) return null;
  return (
    <div className="mt-2 text-xs space-y-1">
      {results.map((r) => (
        <div key={r.plz} className="text-muted-foreground">
          <span className="font-mono">{r.plz}</span> →{" "}
          {r.vnb ? <span className="text-foreground">{r.vnb} ({r.region})</span> : <span className="text-amber-600">VNB unbekannt — manuell prüfen</span>}
        </div>
      ))}
    </div>
  );
}


