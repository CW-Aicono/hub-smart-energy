// MaLo / MeLo Validierung nach BDEW-Spezifikation

/**
 * MaLo-ID (Marktlokations-ID): 11-stellig numerisch.
 * Prüfziffer = (10 - (Σ(2*ungerade-pos) + Σ(1*gerade-pos)) mod 10) mod 10
 * Quelle: BDEW „Codes und Identifikatoren", Anhang B.
 */
export function isValidMaLo(id: string): boolean {
  const clean = id?.trim();
  if (!clean) return false;
  if (!/^\d{11}$/.test(clean)) return false;
  const digits = clean.split("").map((d) => Number.parseInt(d, 10));
  const check = digits[10];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const factor = i % 2 === 0 ? 2 : 1;
    sum += digits[i] * factor;
  }
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

export function maLoError(id: string): string | null {
  if (!id?.trim()) return null;
  if (!/^\d{11}$/.test(id.trim())) return "MaLo-ID muss aus 11 Ziffern bestehen.";
  if (!isValidMaLo(id)) return "MaLo-ID Prüfziffer ungültig.";
  return null;
}

/**
 * MeLo-ID (Messlokations-ID): 33 Stellen.
 * Aufbau (BDEW): 2 Stellen Land (DE) + 6 Stellen Netzbetreiber-Nummer
 * + 24 Stellen alphanumerisch + 1 Stelle Prüfzeichen.
 * Wir prüfen Format/Länge; eine echte Prüfziffer-Berechnung ist herstellerabhängig
 * und wird hier nicht erzwungen — sonst zu viele false-positives.
 */
export function isValidMeLo(id: string): boolean {
  const clean = id?.trim().toUpperCase();
  if (!clean) return false;
  if (clean.length !== 33) return false;
  if (!/^DE[0-9A-Z]{31}$/.test(clean)) return false;
  return true;
}

export function meLoError(id: string): string | null {
  if (!id?.trim()) return null;
  if (!isValidMeLo(id)) return "MeLo-ID muss 33 Zeichen lang sein und mit 'DE' beginnen.";
  return null;
}
