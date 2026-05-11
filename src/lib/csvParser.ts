import * as XLSX from "@e965/xlsx";

export interface ParsedRow {
  [key: string]: string;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
}

// Remove BOM from UTF-8 encoded files (common in German Excel exports)
function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

// Detect delimiter: semicolon vs comma
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSVText(text: string): ParseResult {
  const clean = stripBOM(text);
  const delimiter = detectDelimiter(clean);
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0], delimiter);
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter);
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

export function parseExcelBuffer(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  if (jsonRows.length === 0) return { headers: [], rows: [] };

  const headers = Object.keys(jsonRows[0]);
  const rows: ParsedRow[] = jsonRows.map((r) => {
    const row: ParsedRow = {};
    headers.forEach((h) => {
      const val = r[h];
      row[h] = val instanceof Date ? formatExcelDate(val) : String(val ?? "");
    });
    return row;
  });
  return { headers, rows };
}

function formatExcelDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    return parseExcelBuffer(buffer);
  }
  const text = await file.text();
  return parseCSVText(text);
}

// ─── Column auto-detection ───────────────────────────────────────────

export type MappableField =
  | "meter_number"
  | "meter_name"
  | "location_name"
  | "date"
  | "time"
  | "value"
  | "notes"
  | "energy_type"
  | "unit"
  | "period_type"
  | "source_block"
  | "none";

const HEADER_PATTERNS: Partial<Record<MappableField, RegExp>> = {
  meter_number: /^(z[äa]hler(nummer|nr|[\-_\s]?nr\.?)?|meter[\-_\s]?number|meterno)$/i,
  meter_name: /^(z[äa]hler(name)?|meter|meter[\-_\s]?name|name)$/i,
  location_name: /^(standort|location|geb[äa]ude|liegenschaft)$/i,
  date: /^(datum|ablesedatum|date|reading[\-_\s]?date|zeitraum|period|monat|tag|day|bucket|zeitstempel|timestamp)$/i,
  time: /^(zeit|uhrzeit|time|stunde)$/i,
  value: /^(wert|z[äa]hlerstand|stand|value|verbrauch|consumption|reading|leistung|power|kwh|kw)$/i,
  notes: /^(notiz|bemerkung|notes?|kommentar|comment)$/i,
  energy_type: /^(energieart|energy[\-_\s]?type|medium|art)$/i,
  unit: /^(einheit|unit)$/i,
  period_type: /^(periode|period[\-_\s]?type|periodentyp)$/i,
  source_block: /^(quelle|source|datenart|block)$/i,
};

export function autoDetectMapping(headers: string[]): Record<string, MappableField> {
  const mapping: Record<string, MappableField> = {};
  const used = new Set<MappableField>();

  headers.forEach((h) => {
    for (const [field, pattern] of Object.entries(HEADER_PATTERNS) as [string, RegExp][]) {
      const f = field as MappableField;
      if (!used.has(f) && pattern.test(h.trim())) {
        mapping[h] = f;
        used.add(f);
        return;
      }
    }
    mapping[h] = "none";
  });
  return mapping;
}

// ─── Value parsing helpers ───────────────────────────────────────────

/** Convert German number format (1.234,56) to JS number */
export function parseGermanNumber(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  let s = raw.trim();
  // If contains both . and , -> German format
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Parse various date formats and return YYYY-MM-DD (date-only). */
export function parseFlexibleDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim().split(/[ T]/)[0]; // strip any time portion

  // MM/YYYY or MM.YYYY -> first of month
  const mmYYYY = s.match(/^(\d{1,2})[./](\d{4})$/);
  if (mmYYYY) {
    const m = mmYYYY[1].padStart(2, "0");
    return `${mmYYYY[2]}-${m}-01`;
  }

  // DD.MM.YYYY or DD/MM/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (ddmmyyyy) {
    const d = ddmmyyyy[1].padStart(2, "0");
    const m = ddmmyyyy[2].padStart(2, "0");
    return `${ddmmyyyy[3]}-${m}-${d}`;
  }

  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, "0");
    const d = iso[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Parse a date+time pair into an ISO timestamp (UTC).
 * Accepts date in any format from parseFlexibleDate, time as HH:MM[:SS].
 * If no time is given, midnight is used. Input is treated as Berlin local time.
 */
export function parseFlexibleTimestamp(rawDate: string, rawTime?: string): string | null {
  // Combined ISO timestamp like "2024-03-15T10:25:00Z"
  if (rawDate && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawDate.trim())) {
    const d = new Date(rawDate.trim());
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const datePart = parseFlexibleDate(rawDate);
  if (!datePart) return null;
  let h = 0, m = 0, s = 0;
  if (rawTime && rawTime.trim()) {
    const tm = rawTime.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!tm) return null;
    h = parseInt(tm[1], 10);
    m = parseInt(tm[2], 10);
    s = tm[3] ? parseInt(tm[3], 10) : 0;
  }
  const [y, mo, d] = datePart.split("-").map((x) => parseInt(x, 10));
  // Treat as UTC for stable round-trip (Berlin offset can be applied by caller)
  const date = new Date(Date.UTC(y, mo - 1, d, h, m, s));
  return date.toISOString();
}

/** Generate CSV template content */
export function generateReadingsTemplate(): string {
  return `Zählernummer;Datum;Wert;Notiz\n12345678;01.01.2023;15234,5;Jahresablesung\n12345678;01.01.2024;17890,2;Jahresablesung`;
}

export function generateConsumptionTemplate(): string {
  return `Zählernummer;Datum;Wert;Energieart\n12345678;15.01.2024;42,3;strom\n12345678;16.01.2024;38,7;strom`;
}

export function generateConsumptionMonthlyTemplate(): string {
  return `Zählernummer;Datum;Wert;Energieart\n12345678;01.01.2024;1250,5;strom\n12345678;01.02.2024;1180,3;strom`;
}

export function generatePower5MinTemplate(): string {
  return `Zählernummer;Datum;Zeit;Wert;Energieart\n12345678;15.01.2024;08:00;3,42;strom\n12345678;15.01.2024;08:05;3,55;strom\n12345678;15.01.2024;08:10;3,61;strom`;
}
