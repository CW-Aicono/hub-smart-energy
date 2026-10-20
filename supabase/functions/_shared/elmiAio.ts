/**
 * ELMI All-in-One (Modbus TCP Protokoll v1.4) – reine Rechenlogik.
 * Keine Deno-/Node-Abhängigkeiten, damit Edge Functions und Vitest sie teilen.
 *
 * Vorzeichen: Sollwert > 0 = Speicher lädt, < 0 = Speicher entlädt.
 * Netzleistung: > 0 = Netzbezug, < 0 = Einspeisung (PV-Überschuss).
 */

/** Zwei 16-Bit-Register (Big-Endian) → Wert mit Skalierung. */
export function decodeRegisters32(hi: number, lo: number, signed: boolean, scale = 0.1): number {
  let raw = ((hi & 0xffff) * 0x10000) + (lo & 0xffff);
  if (signed && raw >= 0x80000000) raw -= 0x100000000;
  return Math.round(raw * scale * 1000) / 1000;
}

/** Wert in Watt → zwei Register für 1200/1201 (SINT32, Skalierung 0,1). */
export function encodeSetpointW(watts: number): [number, number] {
  let raw = Math.round(watts * 10);
  if (raw < 0) raw += 0x100000000;
  return [Math.floor(raw / 0x10000) & 0xffff, raw & 0xffff];
}

export interface StorageSetpointInput {
  /** Aktuelle Netzleistung am Netzverknüpfungspunkt in kW (+ Bezug, − Einspeisung). */
  gridKw: number;
  /** Zuletzt gesetzter Speicher-Sollwert in kW (bereits in gridKw enthalten). */
  currentSetpointKw: number;
  /** Sicherheitsabstand in kW. */
  bufferKw: number;
  /** Mindestleistung der AiO (Standard 5 kW). */
  minKw: number;
  /** Maximale Ladeleistung (Register 1074) in kW. */
  maxChargeKw: number;
  /** Maximale Entladeleistung (Register 1076) in kW. */
  maxDischargeKw: number;
  /** Ladestand in %, null = unbekannt. */
  socPct: number | null;
  /** Entladen zur Deckung des eigenen Verbrauchs erlaubt. */
  allowSelfDischarge: boolean;
}

/**
 * Berechnet den Sollwert so, dass der Netzanschluss Richtung 0 geregelt wird.
 * Entladen ins Netz ist ausgeschlossen: Entladeleistung ist nie größer als der
 * Netzbezug ohne Speicher.
 */
export function computeStorageSetpointKw(i: StorageSetpointInput): number {
  // Netzleistung ohne den Speicher
  const baseGridKw = i.gridKw - i.currentSetpointKw;
  const min = Math.max(0, i.minKw);

  if (baseGridKw < 0) {
    // PV-Überschuss → laden
    if (i.socPct !== null && i.socPct >= 100) return 0;
    const target = -baseGridKw - i.bufferKw;
    if (target < min) return 0;
    return round1(Math.min(target, Math.max(0, i.maxChargeKw)));
  }

  // Netzbezug → ggf. entladen (nur Eigenverbrauch)
  if (!i.allowSelfDischarge) return 0;
  if (i.socPct !== null && i.socPct <= 5) return 0;
  const target = baseGridKw - i.bufferKw;
  if (target < min) return 0;
  return -round1(Math.min(target, Math.max(0, i.maxDischargeKw)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
