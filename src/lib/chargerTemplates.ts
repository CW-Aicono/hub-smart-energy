// Ladestations-Vorlagen: was eine Vorlage festlegt, darf der Nutzer nicht ändern.
// Spiegelt den DB-Trigger enforce_charger_template.
export interface ChargerVariant {
  key: string;
  label: string;
  charging_type?: "AC" | "DC";
  connector_types?: string[];
  connector_count?: number;
  max_power_kw?: number;
  cable_attached?: boolean;
  supports_connector_lock?: boolean;
  phases?: number[];
  min_current_a?: number;
  max_current_a?: number;
}

export function getVariants(model: { variants?: unknown } | null | undefined): ChargerVariant[] {
  return Array.isArray(model?.variants) ? (model!.variants as ChargerVariant[]) : [];
}

export interface TemplateLocks {
  connectorTypes: string[] | null; // erlaubte Stecker, null = frei
  connectorCount: number | null;
  maxPowerKw: number | null; // Obergrenze
  cableAttached: boolean | null;
  canUnlock: boolean;
}

export function templateLocks(v: ChargerVariant | null | undefined): TemplateLocks {
  const cable = v?.cable_attached ?? null;
  return {
    connectorTypes: v?.connector_types?.length ? v.connector_types : null,
    connectorCount: v?.connector_count ?? null,
    maxPowerKw: v?.max_power_kw ?? null,
    cableAttached: cable,
    canUnlock: cable === true ? false : v?.supports_connector_lock !== false,
  };
}

/** Wendet die Vorlage auf Formularwerte an (gleiche Regeln wie der DB-Trigger). */
export function applyTemplate(
  v: ChargerVariant,
  form: { connector_type: string; connector_count: string; max_power_kw: string },
) {
  const l = templateLocks(v);
  const given = form.connector_type.split(",").filter(Boolean);
  const connector_type = l.connectorTypes
    ? (given.length && given.every((g) => l.connectorTypes!.includes(g)) ? given : l.connectorTypes).join(",")
    : form.connector_type;
  const p = parseFloat(form.max_power_kw);
  const max_power_kw = l.maxPowerKw != null && (!(p > 0) || p > l.maxPowerKw) ? String(l.maxPowerKw) : form.max_power_kw;
  return {
    connector_type,
    connector_count: l.connectorCount != null ? String(l.connectorCount) : form.connector_count,
    max_power_kw,
  };
}

/** Darf ein Ladepunkt per OCPP entriegelt werden? Unbekannt = ja (Altbestand). */
export function canUnlockConnector(cp: { cable_attached?: boolean | null; supports_connector_lock?: boolean | null }) {
  if (cp.cable_attached === true) return false;
  return cp.supports_connector_lock !== false;
}
