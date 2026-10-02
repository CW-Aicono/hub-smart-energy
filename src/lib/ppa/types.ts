export type PpaType = "onsite" | "offsite";
export type PpaStatus = "draft" | "active" | "suspended" | "expired" | "terminated";
export type SupplyModel = "direct_line" | "gemeinsame_gebaeude" | "mieterstrom";
export type SurplusHandling = "grid_feed_in" | "battery_storage" | "offsite_ppa";
export type DeliveryType = "physical" | "financial" | "sleeved";
export type TsoArea = "TenneT" | "50Hertz" | "Amprion" | "TransnetBW";
export type GridLevel = "HS" | "MS" | "NS";
export type EnergySource = "solar" | "wind" | "hydro" | "biomass" | "mixed";

export interface PpaContract {
  id: string;
  tenant_id: string;
  ppa_type: PpaType;
  status: PpaStatus;
  producer_name: string;
  producer_market_id: string | null;
  offtaker_name: string;
  offtaker_market_id: string | null;
  contract_start: string;
  contract_end: string;
  notice_period_days: number;
  auto_renewal: boolean;
  contracted_volume_kwh_pa: number | null;
  price_model: "fixed" | "index_linked" | "spot_plus_premium" | "floor_cap";
  price_eur_per_kwh: number | null;
  price_formula: any;
  plant_id: string | null;
  plant_description: string | null;
  plant_capacity_kw: number | null;
  energy_source: EnergySource;
  goo_required: boolean;
  goo_registry: string | null;
  mieterstrom_settings_id: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PpaOnsiteConfig {
  id: string;
  contract_id: string;
  tenant_id: string;
  building_id: string | null;
  supply_model: SupplyModel;
  generation_meter_id: string | null;
  self_consumption_target_pct: number | null;
  surplus_handling: SurplusHandling;
}

export interface PpaOffsiteConfig {
  id: string;
  contract_id: string;
  tenant_id: string;
  plant_location: string | null;
  plant_tso_area: TsoArea | null;
  plant_grid_level: GridLevel | null;
  balancing_responsible_party: string | null;
  balancing_group_id: string | null;
  delivery_type: DeliveryType;
  intermediary_name: string | null;
  intermediary_market_id: string | null;
  imbalance_responsibility: "producer" | "offtaker" | "shared";
  mscons_sender_id: string | null;
  mscons_receiver_id: string | null;
}

export interface PpaDocument {
  id: string;
  contract_id: string;
  tenant_id: string;
  doc_type: "contract" | "amendment" | "goo_certificate" | "invoice" | "meter_report" | "termination" | "other";
  filename: string;
  storage_path: string;
  file_hash: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

export interface PpaStatusHistoryEntry {
  id: string;
  contract_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}
