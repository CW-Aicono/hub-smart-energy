import { useMemo, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useCreatePpaContract } from "@/hooks/usePpaContracts";
import { useLocations } from "@/hooks/useLocations";
import { useMeters } from "@/hooks/useMeters";
import { useSpotPrices } from "@/hooks/useSpotPrices";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { computeApplicablePrice, priceModelLabel } from "@/lib/ppa/priceFormula";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Save, FileSignature } from "lucide-react";
import type { PpaType, SupplyModel, SurplusHandling, DeliveryType, TsoArea, GridLevel, EnergySource } from "@/lib/ppa/types";
import type { PriceModel } from "@/lib/ppa/priceFormula";

interface WizardState {
  step: number;
  ppa_type: PpaType;
  producer_name: string;
  producer_market_id: string;
  offtaker_name: string;
  offtaker_market_id: string;
  contract_start: string;
  contract_end: string;
  notice_period_days: number;
  auto_renewal: boolean;
  contracted_volume_kwh_pa: string;
  reference_number: string;
  notes: string;
  energy_source: EnergySource;
  goo_required: boolean;
  goo_registry: string;
  price_model: PriceModel;
  price_eur_per_kwh: string;
  price_premium: string;
  price_floor: string;
  price_cap: string;
  price_factor: string;
  price_offset: string;
  // on-site
  building_id: string;
  generation_meter_id: string;
  supply_model: SupplyModel;
  surplus_handling: SurplusHandling;
  self_consumption_target_pct: string;
  consumption_meter_ids: string[];
  mieterstrom_settings_id: string;
  // off-site
  plant_location: string;
  plant_tso_area: TsoArea | "";
  plant_grid_level: GridLevel | "";
  delivery_type: DeliveryType;
  balancing_responsible_party: string;
  balancing_group_id: string;
  intermediary_name: string;
  imbalance_responsibility: "producer" | "offtaker" | "shared";
}

const initial: WizardState = {
  step: 1,
  ppa_type: "onsite",
  producer_name: "",
  producer_market_id: "",
  offtaker_name: "",
  offtaker_market_id: "",
  contract_start: new Date().toISOString().slice(0, 10),
  contract_end: new Date(Date.now() + 5 * 365 * 86400000).toISOString().slice(0, 10),
  notice_period_days: 90,
  auto_renewal: false,
  contracted_volume_kwh_pa: "",
  reference_number: "",
  notes: "",
  energy_source: "solar",
  goo_required: false,
  goo_registry: "",
  price_model: "fixed",
  price_eur_per_kwh: "0.12",
  price_premium: "0.02",
  price_floor: "0.05",
  price_cap: "0.20",
  price_factor: "1.0",
  price_offset: "0",
  building_id: "",
  generation_meter_id: "",
  supply_model: "direct_line",
  surplus_handling: "grid_feed_in",
  self_consumption_target_pct: "",
  consumption_meter_ids: [],
  mieterstrom_settings_id: "",
  plant_location: "",
  plant_tso_area: "",
  plant_grid_level: "",
  delivery_type: "physical",
  balancing_responsible_party: "",
  balancing_group_id: "",
  intermediary_name: "",
  imbalance_responsibility: "producer",
};

type Action = { type: "set"; patch: Partial<WizardState> };
function reducer(state: WizardState, action: Action): WizardState {
  if (action.type === "set") return { ...state, ...action.patch };
  return state;
}

export default function PPAWizard() {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const [state, dispatch] = useReducer(reducer, initial);
  const set = (patch: Partial<WizardState>) => dispatch({ type: "set", patch });
  const create = useCreatePpaContract();
  const [submitting, setSubmitting] = useState(false);

  const { locations } = useLocations();
  const { meters } = useMeters(state.building_id || undefined);
  const { currentPrice } = useSpotPrices();

  const { data: msSettings = [] } = useQuery({
    queryKey: ["mieterstrom-settings", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_electricity_settings")
        .select("id, location_id")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isOnsite = state.ppa_type === "onsite";
  const totalSteps = isOnsite ? 7 : 6;

  const epexEurPerKwh = currentPrice ? Number(currentPrice.price_eur_mwh) / 1000 : null;

  const previewPrice = useMemo(() => {
    let formula: any = null;
    if (state.price_model === "spot_plus_premium") formula = { premium: Number(state.price_premium) };
    else if (state.price_model === "floor_cap") formula = { floor: Number(state.price_floor), cap: Number(state.price_cap) };
    else if (state.price_model === "index_linked") formula = { factor: Number(state.price_factor), offset: Number(state.price_offset) };
    return computeApplicablePrice(state.price_model, Number(state.price_eur_per_kwh), formula, epexEurPerKwh);
  }, [state.price_model, state.price_eur_per_kwh, state.price_premium, state.price_floor, state.price_cap, state.price_factor, state.price_offset, epexEurPerKwh]);

  function validateStep(): string | null {
    const s = state;
    switch (s.step) {
      case 1: return null;
      case 2:
        if (!s.producer_name.trim()) return "Erzeuger erforderlich";
        if (!s.offtaker_name.trim()) return "Abnehmer erforderlich";
        if (!s.contract_start || !s.contract_end) return "Laufzeit erforderlich";
        if (new Date(s.contract_end) <= new Date(s.contract_start)) return "Vertragsende muss nach Vertragsbeginn liegen";
        return null;
      case 3:
        if (s.price_model === "fixed" && !(Number(s.price_eur_per_kwh) > 0)) return "Festpreis > 0 erforderlich";
        if (s.price_model === "floor_cap" && Number(s.price_floor) > Number(s.price_cap)) return "Floor muss ≤ Cap sein";
        return null;
      case 4:
        if (isOnsite && !s.building_id) return "Gebäude wählen";
        if (!isOnsite) {
          if (!s.plant_location.trim()) return "Anlagenstandort erforderlich";
        }
        return null;
      case 5:
        if (isOnsite && s.consumption_meter_ids.length === 0) return "Mindestens einen Verbrauchszähler wählen";
        return null;
      default: return null;
    }
  }

  function next() {
    const err = validateStep();
    if (err) { toast.error(err); return; }
    set({ step: Math.min(totalSteps, state.step + 1) });
  }
  function prev() {
    set({ step: Math.max(1, state.step - 1) });
  }

  async function submit(activate: boolean) {
    const err = validateStep();
    if (err) { toast.error(err); return; }
    setSubmitting(true);
    try {
      let price_formula: any = null;
      if (state.price_model === "spot_plus_premium") price_formula = { base: "epex_spot", premium: Number(state.price_premium) };
      else if (state.price_model === "floor_cap") price_formula = { base: "epex_spot", floor: Number(state.price_floor), cap: Number(state.price_cap) };
      else if (state.price_model === "index_linked") price_formula = { base: "epex_spot", factor: Number(state.price_factor), offset: Number(state.price_offset) };

      const contractInput: any = {
        ppa_type: state.ppa_type,
        producer_name: state.producer_name.trim(),
        producer_market_id: state.producer_market_id.trim() || null,
        offtaker_name: state.offtaker_name.trim(),
        offtaker_market_id: state.offtaker_market_id.trim() || null,
        contract_start: state.contract_start,
        contract_end: state.contract_end,
        notice_period_days: Number(state.notice_period_days) || 90,
        auto_renewal: state.auto_renewal,
        contracted_volume_kwh_pa: state.contracted_volume_kwh_pa ? Number(state.contracted_volume_kwh_pa) : null,
        price_model: state.price_model,
        price_eur_per_kwh: state.price_model === "fixed" ? Number(state.price_eur_per_kwh) : null,
        price_formula,
        plant_description: null,
        plant_capacity_kw: null,
        plant_id: null,
        energy_source: state.energy_source,
        goo_required: state.goo_required,
        goo_registry: state.goo_required && state.goo_registry ? state.goo_registry : null,
        mieterstrom_settings_id: isOnsite && state.mieterstrom_settings_id ? state.mieterstrom_settings_id : null,
        reference_number: state.reference_number.trim() || null,
        notes: state.notes.trim() || null,
        status: activate ? "active" : "draft",
      };

      const onsiteInput = isOnsite ? {
        building_id: state.building_id,
        supply_model: state.supply_model,
        generation_meter_id: state.generation_meter_id || null,
        self_consumption_target_pct: state.self_consumption_target_pct ? Number(state.self_consumption_target_pct) : null,
        surplus_handling: state.surplus_handling,
      } : undefined;

      const offsiteInput = !isOnsite ? {
        plant_location: state.plant_location || null,
        plant_tso_area: state.plant_tso_area || null,
        plant_grid_level: state.plant_grid_level || null,
        balancing_responsible_party: state.balancing_responsible_party || null,
        balancing_group_id: state.balancing_group_id || null,
        delivery_type: state.delivery_type,
        intermediary_name: state.intermediary_name || null,
        intermediary_market_id: null,
        imbalance_responsibility: state.imbalance_responsibility,
        mscons_sender_id: null,
        mscons_receiver_id: null,
      } : undefined;

      const created = await create.mutateAsync({
        contract: contractInput,
        onsite: onsiteInput as any,
        offsite: offsiteInput as any,
        consumptionMeterIds: isOnsite ? state.consumption_meter_ids : undefined,
      });
      toast.success(activate ? "PPA aktiviert" : "Entwurf gespeichert");
      navigate(`/ppa/${created.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  const progressPct = Math.round((state.step / totalSteps) * 100);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="container max-w-3xl space-y-6">
          <div className="flex items-center gap-3">
            <FileSignature className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Neuen PPA anlegen</h1>
              <p className="text-sm text-muted-foreground">Schritt {state.step.toLocaleString("de-DE")} von {totalSteps.toLocaleString("de-DE")}</p>
            </div>
          </div>
      <Progress value={progressPct} />

      <Card>
        <CardHeader>
          <CardTitle>{stepTitle(state.step, isOnsite)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => set({ ppa_type: "onsite" })}
                className={`rounded-lg border p-4 text-left transition-colors ${state.ppa_type === "onsite" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                <div className="font-semibold">On-site PPA</div>
                <div className="text-xs text-muted-foreground mt-1">Direktbelieferung am Gebäude (PV-Dach, Direktleitung, Mieterstrom)</div>
              </button>
              <button type="button" onClick={() => set({ ppa_type: "offsite" })}
                className={`rounded-lg border p-4 text-left transition-colors ${state.ppa_type === "offsite" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                <div className="font-semibold">Off-site PPA</div>
                <div className="text-xs text-muted-foreground mt-1">Lieferung über das öffentliche Netz (physisch/sleeved/finanziell)</div>
              </button>
            </div>
          )}

          {state.step === 2 && (
            <div className="space-y-3">
              <Field label="Erzeuger" v={state.producer_name} onChange={(v) => set({ producer_name: v })} required />
              <Field label="Marktpartner-ID Erzeuger (optional)" v={state.producer_market_id} onChange={(v) => set({ producer_market_id: v })} />
              <Field label="Abnehmer" v={state.offtaker_name} onChange={(v) => set({ offtaker_name: v })} required />
              <Field label="Marktpartner-ID Abnehmer (optional)" v={state.offtaker_market_id} onChange={(v) => set({ offtaker_market_id: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vertragsbeginn" v={state.contract_start} onChange={(v) => set({ contract_start: v })} type="date" required />
                <Field label="Vertragsende" v={state.contract_end} onChange={(v) => set({ contract_end: v })} type="date" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kündigungsfrist (Tage)" v={String(state.notice_period_days)} onChange={(v) => set({ notice_period_days: Number(v) })} type="number" />
                <Field label="Jahresvolumen (kWh)" v={state.contracted_volume_kwh_pa} onChange={(v) => set({ contracted_volume_kwh_pa: v })} type="number" />
              </div>
              <Field label="Vertragsnummer (optional)" v={state.reference_number} onChange={(v) => set({ reference_number: v })} />
              <div className="flex items-center gap-2">
                <Checkbox id="renew" checked={state.auto_renewal} onCheckedChange={(c) => set({ auto_renewal: !!c })} />
                <Label htmlFor="renew">Automatische Verlängerung</Label>
              </div>
            </div>
          )}

          {state.step === 3 && (
            <div className="space-y-3">
              <div>
                <Label>Preismodell</Label>
                <Select value={state.price_model} onValueChange={(v) => set({ price_model: v as PriceModel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{priceModelLabel("fixed")}</SelectItem>
                    <SelectItem value="spot_plus_premium">{priceModelLabel("spot_plus_premium")}</SelectItem>
                    <SelectItem value="floor_cap">{priceModelLabel("floor_cap")}</SelectItem>
                    <SelectItem value="index_linked">{priceModelLabel("index_linked")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {state.price_model === "fixed" && (
                <Field label="Festpreis (€/kWh)" v={state.price_eur_per_kwh} onChange={(v) => set({ price_eur_per_kwh: v })} type="number" />
              )}
              {state.price_model === "spot_plus_premium" && (
                <Field label="Premium auf Spot (€/kWh)" v={state.price_premium} onChange={(v) => set({ price_premium: v })} type="number" />
              )}
              {state.price_model === "floor_cap" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Floor (€/kWh)" v={state.price_floor} onChange={(v) => set({ price_floor: v })} type="number" />
                  <Field label="Cap (€/kWh)" v={state.price_cap} onChange={(v) => set({ price_cap: v })} type="number" />
                </div>
              )}
              {state.price_model === "index_linked" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Faktor" v={state.price_factor} onChange={(v) => set({ price_factor: v })} type="number" />
                  <Field label="Offset (€/kWh)" v={state.price_offset} onChange={(v) => set({ price_offset: v })} type="number" />
                </div>
              )}
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <div>Aktueller EPEX-Spot: <strong>{epexEurPerKwh != null ? `${(epexEurPerKwh * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ct/kWh` : "—"}</strong></div>
                <div>Resultierender PPA-Preis: <strong>{previewPrice != null ? `${(previewPrice * 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} ct/kWh` : "—"}</strong></div>
              </div>
            </div>
          )}

          {state.step === 4 && isOnsite && (
            <div className="space-y-3">
              <div>
                <Label>Gebäude</Label>
                <Select value={state.building_id} onValueChange={(v) => set({ building_id: v, generation_meter_id: "", consumption_meter_ids: [] })}>
                  <SelectTrigger><SelectValue placeholder="Gebäude wählen" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Erzeugungs-Zähler (PV)</Label>
                <Select value={state.generation_meter_id} onValueChange={(v) => set({ generation_meter_id: v })}>
                  <SelectTrigger><SelectValue placeholder={state.building_id ? "Zähler wählen" : "Erst Gebäude wählen"} /></SelectTrigger>
                  <SelectContent>
                    {meters.filter((m) => m.energy_type === "electricity").map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Liefermodell</Label>
                  <Select value={state.supply_model} onValueChange={(v) => set({ supply_model: v as SupplyModel })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct_line">Direktleitung</SelectItem>
                      <SelectItem value="gemeinsame_gebaeude">Gemeinsame Gebäude</SelectItem>
                      <SelectItem value="mieterstrom">Mieterstrom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Überschuss-Behandlung</Label>
                  <Select value={state.surplus_handling} onValueChange={(v) => set({ surplus_handling: v as SurplusHandling })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grid_feed_in">Netzeinspeisung</SelectItem>
                      <SelectItem value="battery_storage">Batteriespeicher</SelectItem>
                      <SelectItem value="offsite_ppa">Off-site PPA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Field label="Eigenverbrauchsziel (%)" v={state.self_consumption_target_pct} onChange={(v) => set({ self_consumption_target_pct: v })} type="number" />
            </div>
          )}

          {state.step === 4 && !isOnsite && (
            <div className="space-y-3">
              <Field label="Anlagenstandort" v={state.plant_location} onChange={(v) => set({ plant_location: v })} required />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Regelzone</Label>
                  <Select value={state.plant_tso_area || ""} onValueChange={(v) => set({ plant_tso_area: v as TsoArea })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TenneT">TenneT</SelectItem>
                      <SelectItem value="50Hertz">50Hertz</SelectItem>
                      <SelectItem value="Amprion">Amprion</SelectItem>
                      <SelectItem value="TransnetBW">TransnetBW</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Spannungsebene</Label>
                  <Select value={state.plant_grid_level || ""} onValueChange={(v) => set({ plant_grid_level: v as GridLevel })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HS">Hochspannung</SelectItem>
                      <SelectItem value="MS">Mittelspannung</SelectItem>
                      <SelectItem value="NS">Niederspannung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Lieferart</Label>
                <Select value={state.delivery_type} onValueChange={(v) => set({ delivery_type: v as DeliveryType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">Physisch</SelectItem>
                    <SelectItem value="sleeved">Sleeved</SelectItem>
                    <SelectItem value="financial">Finanziell (CfD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field label="Bilanzkreisverantwortlicher (BKV)" v={state.balancing_responsible_party} onChange={(v) => set({ balancing_responsible_party: v })} />
              <Field label="Bilanzkreis-ID" v={state.balancing_group_id} onChange={(v) => set({ balancing_group_id: v })} />
              <Field label="Zwischenhändler (optional)" v={state.intermediary_name} onChange={(v) => set({ intermediary_name: v })} />
              <div>
                <Label>Imbalance-Verantwortung</Label>
                <Select value={state.imbalance_responsibility} onValueChange={(v) => set({ imbalance_responsibility: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producer">Erzeuger</SelectItem>
                    <SelectItem value="offtaker">Abnehmer</SelectItem>
                    <SelectItem value="shared">Geteilt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {state.step === 5 && isOnsite && (
            <div className="space-y-3">
              <div>
                <Label>Verbrauchszähler ({state.consumption_meter_ids.length.toLocaleString("de-DE")} ausgewählt)</Label>
                <div className="max-h-64 overflow-auto rounded-md border p-2 space-y-1">
                  {meters.filter((m) => m.energy_type === "electricity" && m.id !== state.generation_meter_id).map((m) => {
                    const checked = state.consumption_meter_ids.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 rounded hover:bg-muted">
                        <Checkbox checked={checked} onCheckedChange={(c) => {
                          set({
                            consumption_meter_ids: c
                              ? [...state.consumption_meter_ids, m.id]
                              : state.consumption_meter_ids.filter((id) => id !== m.id),
                          });
                        }} />
                        <span>{m.name}</span>
                      </label>
                    );
                  })}
                  {meters.length === 0 && <p className="text-xs text-muted-foreground p-2">Keine Zähler im Gebäude vorhanden.</p>}
                </div>
              </div>
              <div className="rounded-md border border-dashed p-3 space-y-2">
                <div className="font-medium text-sm">Mieterstrom-Bridge (optional)</div>
                <Select value={state.mieterstrom_settings_id || "_none"} onValueChange={(v) => set({ mieterstrom_settings_id: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Mieterstrom-Konfiguration verknüpfen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Keine Verknüpfung</SelectItem>
                    {msSettings.filter((s) => !state.building_id || s.location_id === state.building_id).map((s) => {
                      const loc = locations.find((l) => l.id === s.location_id);
                      return <SelectItem key={s.id} value={s.id}>{loc?.name ?? s.location_id}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Wenn verknüpft, werden Verbrauchsdaten aus dem Mieterstrom-Modul referenziert.</p>
              </div>
            </div>
          )}

          {((state.step === 5 && !isOnsite) || (state.step === 6 && isOnsite)) && (
            <div className="space-y-3">
              <div>
                <Label>Energiequelle</Label>
                <Select value={state.energy_source} onValueChange={(v) => set({ energy_source: v as EnergySource })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solar">Solar</SelectItem>
                    <SelectItem value="wind">Wind</SelectItem>
                    <SelectItem value="hydro">Wasser</SelectItem>
                    <SelectItem value="biomass">Biomasse</SelectItem>
                    <SelectItem value="mixed">Mix</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="goo" checked={state.goo_required} onCheckedChange={(c) => set({ goo_required: !!c })} />
                <Label htmlFor="goo">Herkunftsnachweise (GoO) erforderlich</Label>
              </div>
              {state.goo_required && (
                <Field label="GoO-Register (UBA, AIB, …)" v={state.goo_registry} onChange={(v) => set({ goo_registry: v })} />
              )}
              <div>
                <Label>Notizen</Label>
                <Textarea value={state.notes} onChange={(e) => set({ notes: e.target.value })} rows={4} />
              </div>
            </div>
          )}

          {state.step === totalSteps && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3 space-y-1">
                <div><strong>Typ:</strong> {isOnsite ? "On-site" : "Off-site"} PPA</div>
                <div><strong>Erzeuger → Abnehmer:</strong> {state.producer_name} → {state.offtaker_name}</div>
                <div><strong>Laufzeit:</strong> {new Date(state.contract_start).toLocaleDateString("de-DE")} – {new Date(state.contract_end).toLocaleDateString("de-DE")}</div>
                <div><strong>Preismodell:</strong> {priceModelLabel(state.price_model)}</div>
                {state.contracted_volume_kwh_pa && <div><strong>Volumen:</strong> {Number(state.contracted_volume_kwh_pa).toLocaleString("de-DE")} kWh/a</div>}
                {isOnsite && <div><strong>Verbrauchszähler:</strong> {state.consumption_meter_ids.length.toLocaleString("de-DE")}</div>}
              </div>
              <p className="text-muted-foreground">Dokumente können nach dem Anlegen in der Detailansicht hochgeladen werden.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={prev} disabled={state.step === 1 || submitting}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
        </Button>
        <div className="flex gap-2">
          {state.step === totalSteps ? (
            <>
              <Button variant="outline" onClick={() => submit(false)} disabled={submitting}>
                <Save className="h-4 w-4 mr-1" /> Als Entwurf speichern
              </Button>
              <Button onClick={() => submit(true)} disabled={submitting}>
                Aktivieren
              </Button>
            </>
          ) : (
            <Button onClick={next} disabled={submitting}>
              Weiter <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
      </div>
      </main>
    </div>
  );
}

function stepTitle(step: number, isOnsite: boolean): string {
  if (step === 1) return "Typ wählen";
  if (step === 2) return "Stammdaten";
  if (step === 3) return "Preismodell";
  if (step === 4) return isOnsite ? "On-site Konfiguration" : "Off-site Konfiguration";
  if (step === 5) return isOnsite ? "Verbrauchszähler & Mieterstrom" : "Energiequelle & Notizen";
  if (step === 6) return isOnsite ? "Energiequelle & Notizen" : "Review";
  return "Review";
}

function Field({ label, v, onChange, type = "text", required }: { label: string; v: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <Label>{label}{required && <span className="text-destructive ml-1">*</span>}</Label>
      <Input type={type} value={v} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
