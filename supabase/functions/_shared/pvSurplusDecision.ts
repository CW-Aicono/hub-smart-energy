// Reine Rechenlogik der PV-Überschussregelung, damit Scheduler, Oberfläche
// und Tests dieselbe Entscheidung nachvollziehen.

export interface DecisionStep {
  key: "grid" | "raw_surplus" | "buffer" | "storage" | "available" | "allocated";
  label: string;
  w: number;
}

export interface SurplusInput {
  /** Netzleistung am Bezugszähler in kW (+ Bezug / − Einspeisung) */
  gridKw: number;
  bufferW: number;
  /** Speicher-Sollwert nach diesem Lauf in kW (+ laden / − entladen) */
  storageTargetKw?: number | null;
  /** Änderung des Speichersollwerts in diesem Lauf in kW */
  storageDeltaKw?: number | null;
  storagePriority?: string | null;
  /** Speicher gehört zur Ladestation (ELMI): Entladen ist kein PV-Überschuss */
  storageCoupled?: boolean;
}

export interface SurplusResult {
  rawSurplusW: number;
  afterBufferW: number;
  storageW: number;
  availableW: number;
  steps: DecisionStep[];
}

/** NULL in der Konfiguration = automatisch: ELMI-Vorlage gilt als gekoppelt. */
export function isStorageCoupled(flag: boolean | null | undefined, template: string | null | undefined): boolean {
  if (flag === true || flag === false) return flag;
  return template === "elmi_aio";
}

export function computeSurplus(i: SurplusInput): SurplusResult {
  const gridW = Math.round(i.gridKw * 1000);
  const rawSurplusW = gridW < 0 ? Math.abs(gridW) : 0;
  const afterBufferW = Math.max(0, rawSurplusW - Math.max(0, i.bufferW));
  let storageW = 0;
  if (i.storagePriority === "storage_first" && (i.storageDeltaKw ?? 0) > 0) {
    storageW += Math.round((i.storageDeltaKw ?? 0) * 1000);
  }
  if (i.storageCoupled && (i.storageTargetKw ?? 0) < 0) {
    // Gekoppelter Speicher entlädt in die Ladestation: diese Leistung
    // senkt den Netzbezug, ist aber kein Solarstrom.
    storageW += Math.round(Math.abs(i.storageTargetKw ?? 0) * 1000);
  }
  const availableW = Math.max(0, afterBufferW - storageW);
  return {
    rawSurplusW,
    afterBufferW,
    storageW,
    availableW,
    steps: [
      { key: "grid", label: gridW < 0 ? "Einspeisung am Bezugszähler" : "Netzbezug am Bezugszähler", w: gridW },
      { key: "raw_surplus", label: "PV-Überschuss", w: rawSurplusW },
      { key: "buffer", label: "Sicherheitspuffer", w: -Math.min(rawSurplusW, Math.max(0, i.bufferW)) },
      { key: "storage", label: "Anteil Speicher", w: -Math.min(afterBufferW, storageW) },
      { key: "available", label: "Verfügbar für Ladepunkte", w: availableW },
    ],
  };
}
