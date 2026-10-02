/**
 * RFID-Tag-Normalisierung.
 * Wallboxen lesen denselben RFID-Chip in 4 möglichen Varianten aus:
 *  - raw:                       wie gelesen
 *  - byte_reversed:             Bytes in umgekehrter Reihenfolge (Endianness)
 *  - nibble_swap:               in jedem Byte die zwei Hex-Nibbles getauscht
 *  - byte_reversed_nibble_swap: beides kombiniert
 *
 * Diese Util normalisiert einen vom Charger empfangenen idTag in die
 * "gespeicherte" Form, basierend auf dem konfigurierten Lesemodus der Wallbox.
 * Damit der Match unabhängig von Schreibweise/Whitespace funktioniert,
 * arbeiten wir auf Hex-Bytes (Großbuchstaben, ohne Trenner).
 */

export type RfidReadMode =
  | "raw"
  | "byte_reversed"
  | "nibble_swap"
  | "byte_reversed_nibble_swap";

function toHexBytes(input: string): string[] | null {
  const cleaned = (input || "").replace(/[\s:.-]/g, "").toUpperCase();
  if (!cleaned || cleaned.length % 2 !== 0 || !/^[0-9A-F]+$/.test(cleaned)) {
    return null;
  }
  const bytes: string[] = [];
  for (let i = 0; i < cleaned.length; i += 2) bytes.push(cleaned.substring(i, i + 2));
  return bytes;
}

function nibbleSwapByte(byte: string): string {
  return byte[1] + byte[0];
}

/**
 * Wandelt einen vom Charger empfangenen idTag in das normalisierte Format
 * (so wie es in der DB unter rfid_tag/app_tag erwartet wird).
 * Bei nicht-hex-Werten (z.B. App-Tags) wird der Input unverändert zurückgegeben.
 */
export function normalizeRfidTag(rawIdTag: string, mode: RfidReadMode): string {
  const bytes = toHexBytes(rawIdTag);
  if (!bytes) return rawIdTag; // App-Tag oder nicht-hex → unverändert

  let result = bytes;
  if (mode === "byte_reversed" || mode === "byte_reversed_nibble_swap") {
    result = [...result].reverse();
  }
  if (mode === "nibble_swap" || mode === "byte_reversed_nibble_swap") {
    result = result.map(nibbleSwapByte);
  }
  return result.join("");
}
