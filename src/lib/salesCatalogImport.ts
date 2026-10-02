import { parseDeNumber, round2 } from "./salesNumberFormat";

export interface CatalogImportRow {
  geraete_klasse: string;
  hersteller: string;
  modell: string;
  ek_preis: number;
  vk_preis: number;
  installations_pauschale: number;
  einheit: string;
  artikelnummer: string | null;
  ean: string | null;
  beschreibung: string | null;
  is_active: boolean;
}

export interface ParseResult {
  rows: CatalogImportRow[];
  errors: string[];
}

const VALID_CLASSES = new Set([
  "meter",
  "gateway",
  "power_supply",
  "network_switch",
  "router",
  "addon_module",
  "cable",
  "accessory",
  "misc",
]);

const CLASS_ALIASES: Record<string, string> = {
  zähler: "meter",
  zaehler: "meter",
  meter: "meter",
  gateway: "gateway",
  netzteil: "power_supply",
  power_supply: "power_supply",
  switch: "network_switch",
  network_switch: "network_switch",
  router: "router",
  addon: "addon_module",
  "addon-modul": "addon_module",
  addon_module: "addon_module",
  kabel: "cable",
  cable: "cable",
  zubehör: "accessory",
  zubehoer: "accessory",
  accessory: "accessory",
  sonstige: "misc",
  misc: "misc",
};

const HEADER_ALIASES: Record<string, keyof CatalogImportRow> = {
  klasse: "geraete_klasse",
  geraete_klasse: "geraete_klasse",
  geräteklasse: "geraete_klasse",
  kategorie: "geraete_klasse",
  hersteller: "hersteller",
  brand: "hersteller",
  modell: "modell",
  model: "modell",
  produkt: "modell",
  ek: "ek_preis",
  ek_preis: "ek_preis",
  "ek €": "ek_preis",
  einkaufspreis: "ek_preis",
  vk: "vk_preis",
  vk_preis: "vk_preis",
  "vk €": "vk_preis",
  verkaufspreis: "vk_preis",
  preis: "vk_preis",
  installation: "installations_pauschale",
  installations_pauschale: "installations_pauschale",
  "installation €": "installations_pauschale",
  einheit: "einheit",
  unit: "einheit",
  artikelnummer: "artikelnummer",
  "artikel-nr": "artikelnummer",
  "artikel nr": "artikelnummer",
  sku: "artikelnummer",
  ean: "ean",
  gtin: "ean",
  beschreibung: "beschreibung",
  description: "beschreibung",
  aktiv: "is_active",
  is_active: "is_active",
  active: "is_active",
};

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  const tab = (firstLine.match(/\t/g) || []).length;
  if (tab >= semi && tab >= comma) return "\t";
  return semi >= comma ? ";" : ",";
}

// Very small CSV tokenizer supporting quotes and configurable delimiter.
function parseCsv(text: string, delim: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); out.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((v) => v.trim().length > 0));
}

export function parseCatalogCsv(text: string): ParseResult {
  const errors: string[] = [];
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, "");
  const delim = detectDelimiter(clean);
  const table = parseCsv(clean, delim);
  if (table.length < 2) return { rows: [], errors: ["Datei enthält keine Datenzeilen."] };

  const headers = table[0].map((h) => h.trim().toLowerCase());
  const colMap: Partial<Record<keyof CatalogImportRow, number>> = {};
  headers.forEach((h, idx) => {
    const key = HEADER_ALIASES[h];
    if (key) colMap[key] = idx;
  });

  const missing: string[] = [];
  (["hersteller", "modell", "vk_preis"] as const).forEach((k) => {
    if (colMap[k] === undefined) missing.push(k);
  });
  if (missing.length) {
    errors.push(`Pflichtspalten fehlen: ${missing.join(", ")}`);
    return { rows: [], errors };
  }

  const rows: CatalogImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const get = (k: keyof CatalogImportRow) =>
      colMap[k] !== undefined ? (line[colMap[k]!] ?? "").trim() : "";

    const hersteller = get("hersteller");
    const modell = get("modell");
    if (!hersteller || !modell) {
      errors.push(`Zeile ${r + 1}: Hersteller/Modell fehlt.`);
      continue;
    }
    const klasseRaw = (get("geraete_klasse") || "misc").toLowerCase();
    const klasse = CLASS_ALIASES[klasseRaw] ?? (VALID_CLASSES.has(klasseRaw) ? klasseRaw : "misc");

    const vk = parseDeNumber(get("vk_preis"));
    if (!Number.isFinite(vk)) {
      errors.push(`Zeile ${r + 1}: VK-Preis nicht lesbar ("${get("vk_preis")}").`);
      continue;
    }
    const ek = parseDeNumber(get("ek_preis"));
    const inst = parseDeNumber(get("installations_pauschale"));
    const aktivRaw = get("is_active").toLowerCase();
    const is_active = !["0", "false", "nein", "no", "inaktiv"].includes(aktivRaw);

    rows.push({
      geraete_klasse: klasse,
      hersteller,
      modell,
      ek_preis: Number.isFinite(ek) ? round2(ek) : 0,
      vk_preis: round2(vk),
      installations_pauschale: Number.isFinite(inst) ? round2(inst) : 0,
      einheit: get("einheit") || "Stück",
      artikelnummer: get("artikelnummer") || null,
      ean: get("ean") || null,
      beschreibung: get("beschreibung") || null,
      is_active,
    });
  }

  return { rows, errors };
}

/** Template CSV (Semicolon, UTF-8 BOM) for user download. */
export function catalogCsvTemplate(): string {
  const header = [
    "geraete_klasse",
    "hersteller",
    "modell",
    "artikelnummer",
    "ean",
    "ek_preis",
    "vk_preis",
    "installations_pauschale",
    "einheit",
    "beschreibung",
    "is_active",
  ];
  const example = [
    "meter",
    "Shelly",
    "Pro 3EM",
    "SH-PRO-3EM",
    "3800235268421",
    "89,00",
    "129,00",
    "60,00",
    "Stück",
    "3-Phasen Energiezähler",
    "1",
  ];
  return "\uFEFF" + header.join(";") + "\r\n" + example.join(";") + "\r\n";
}
