/**
 * Import/Export für Lade-Nutzer, Nutzergruppen und NFC-Tags.
 *
 * Hinweise:
 *  - Alle Operationen laufen client-seitig über den Supabase-Client.
 *    RLS sorgt dafür, dass nur die eigenen Tenant-Daten geschrieben werden;
 *    zusätzlich stempeln wir tenant_id explizit beim Insert.
 *  - Excel-Dateien werden mit @e965/xlsx erzeugt/gelesen; CSV nutzt denselben Writer
 *    mit dem CSV-Format. So bleibt das Mapping identisch.
 *  - "NFC-Tags" ist kein eigenes Modell, sondern eine schlanke Sicht auf
 *    charging_users.rfid_tag (Email → RFID-Tag).
 */

import * as XLSX from "@e965/xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { ChargingUser, ChargingUserGroup } from "@/hooks/useChargingUsers";

export type ChargingTariffLite = { id: string; name: string };

export type ExportType = "users" | "groups" | "nfc";
export type ExportFormat = "xlsx" | "csv";

/* -------------------------- Spaltendefinition --------------------------- */

const USER_HEADERS = [
  "Name",
  "E-Mail",
  "RFID-Tag",
  "Telefon",
  "Gruppe",
  "Tarif",
  "Status",
  "Notizen",
] as const;

const GROUP_HEADERS = [
  "Name",
  "Beschreibung",
  "App-Nutzer (ja/nein)",
  "Tarif",
] as const;

const NFC_HEADERS = ["E-Mail", "RFID-Tag", "Name"] as const;

/* -------------------------- Hilfsfunktionen ----------------------------- */

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function writeSheet(rows: (string | number | null)[][], format: ExportFormat, filename: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daten");
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    downloadBlob(`${filename}.csv`, new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  } else {
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    downloadBlob(`${filename}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }
}

function nameById<T extends { id: string; name: string }>(list: T[], id: string | null): string {
  if (!id) return "";
  return list.find((x) => x.id === id)?.name ?? "";
}

function findIdByName<T extends { id: string; name: string }>(list: T[], name: string): string | null {
  if (!name) return null;
  const hit = list.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  return hit?.id ?? null;
}

/* -------------------------- Export -------------------------------------- */

export function exportUsers(
  users: ChargingUser[],
  groups: ChargingUserGroup[],
  tariffs: ChargingTariffLite[],
  format: ExportFormat,
) {
  const rows: (string | number | null)[][] = [
    [...USER_HEADERS],
    ...users.map((u) => [
      u.name,
      u.email ?? "",
      u.rfid_tag ?? "",
      u.phone ?? "",
      nameById(groups, u.group_id),
      nameById(tariffs, u.tariff_id),
      u.status,
      u.notes ?? "",
    ]),
  ];
  writeSheet(rows, format, `lade-nutzer_${new Date().toISOString().slice(0, 10)}`);
}

export function exportGroups(
  groups: ChargingUserGroup[],
  tariffs: ChargingTariffLite[],
  format: ExportFormat,
) {
  const rows: (string | number | null)[][] = [
    [...GROUP_HEADERS],
    ...groups.map((g) => [
      g.name,
      g.description ?? "",
      g.is_app_user ? "ja" : "nein",
      nameById(tariffs, g.tariff_id),
    ]),
  ];
  writeSheet(rows, format, `lade-nutzergruppen_${new Date().toISOString().slice(0, 10)}`);
}

export function exportNfc(users: ChargingUser[], format: ExportFormat) {
  const rows: (string | number | null)[][] = [
    [...NFC_HEADERS],
    ...users
      .filter((u) => u.rfid_tag && u.rfid_tag.trim().length > 0)
      .map((u) => [u.email ?? "", u.rfid_tag ?? "", u.name]),
  ];
  writeSheet(rows, format, `nfc-tags_${new Date().toISOString().slice(0, 10)}`);
}

/* -------------------------- Vorlagen ------------------------------------ */

export function downloadTemplate(type: ExportType, format: ExportFormat) {
  const sample: Record<ExportType, (string | number | null)[][]> = {
    users: [
      [...USER_HEADERS],
      ["Max Mustermann", "max@example.com", "04A1B2C3", "+49 170 0000000", "Mitarbeiter", "Standard-Tarif", "active", "Beispielzeile — bitte ersetzen"],
    ],
    groups: [
      [...GROUP_HEADERS],
      ["Mitarbeiter", "Interne Belegschaft", "nein", "Standard-Tarif"],
    ],
    nfc: [
      [...NFC_HEADERS],
      ["max@example.com", "04A1B2C3", "Max Mustermann"],
    ],
  };
  const fname: Record<ExportType, string> = {
    users: "vorlage_lade-nutzer",
    groups: "vorlage_nutzergruppen",
    nfc: "vorlage_nfc-tags",
  };
  writeSheet(sample[type], format, fname[type]);
}

/* -------------------------- Import: Parsing ----------------------------- */

export interface ParsedImport {
  headers: string[];
  rows: Record<string, string>[];
}

export async function parseImportFile(file: File): Promise<ParsedImport> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false });
  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = (aoa[0] as string[]).map((h) => String(h ?? "").trim());
  const rows = aoa.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = String((r as string[])[i] ?? "").trim();
    });
    return obj;
  });
  // Leerzeilen entfernen
  return { headers, rows: rows.filter((r) => Object.values(r).some((v) => v !== "")) };
}

/* -------------------------- Import: Validierung & Ausführung ------------- */

export interface ImportIssue {
  row: number;
  severity: "error" | "warning";
  message: string;
}

export interface ImportPreview<T> {
  records: T[];
  issues: ImportIssue[];
  skipped: number;
}

export interface UserImportRecord {
  rowNumber: number;
  name: string;
  email: string | null;
  rfid_tag: string | null;
  phone: string | null;
  group_id: string | null;
  tariff_id: string | null;
  status: "active" | "blocked" | "archived";
  notes: string | null;
  isUpdate: boolean;
  updateUserId?: string;
}

export function buildUserPreview(
  rows: Record<string, string>[],
  existingUsers: ChargingUser[],
  groups: ChargingUserGroup[],
  tariffs: ChargingTariffLite[],
): ImportPreview<UserImportRecord> {
  const issues: ImportIssue[] = [];
  const records: UserImportRecord[] = [];
  let skipped = 0;

  rows.forEach((r, i) => {
    const rowNumber = i + 2; // Zeile 1 = Header
    const name = (r["Name"] ?? "").trim();
    const email = (r["E-Mail"] ?? "").trim().toLowerCase();
    const rfid = (r["RFID-Tag"] ?? "").trim();
    const groupName = (r["Gruppe"] ?? "").trim();
    const tariffName = (r["Tarif"] ?? "").trim();
    const statusRaw = (r["Status"] ?? "active").trim().toLowerCase();

    if (!name) {
      issues.push({ row: rowNumber, severity: "error", message: "'Name' fehlt — Zeile wird übersprungen." });
      skipped++;
      return;
    }
    const status: UserImportRecord["status"] =
      statusRaw === "blocked" || statusRaw === "archived" ? statusRaw : "active";

    let group_id: string | null = null;
    if (groupName) {
      group_id = findIdByName(groups, groupName);
      if (!group_id) {
        issues.push({ row: rowNumber, severity: "warning", message: `Gruppe '${groupName}' nicht gefunden — wird leer gesetzt.` });
      }
    }
    let tariff_id: string | null = null;
    if (tariffName) {
      tariff_id = findIdByName(tariffs, tariffName);
      if (!tariff_id) {
        issues.push({ row: rowNumber, severity: "warning", message: `Tarif '${tariffName}' nicht gefunden — Standard wird verwendet.` });
      }
    }

    // Update vs Insert: Match per E-Mail (falls vorhanden), sonst per Name+RFID
    const existing =
      (email && existingUsers.find((u) => (u.email ?? "").toLowerCase() === email)) ||
      (rfid && existingUsers.find((u) => (u.rfid_tag ?? "") === rfid)) ||
      null;

    records.push({
      rowNumber,
      name,
      email: email || null,
      rfid_tag: rfid || null,
      phone: (r["Telefon"] ?? "").trim() || null,
      group_id,
      tariff_id,
      status,
      notes: (r["Notizen"] ?? "").trim() || null,
      isUpdate: !!existing,
      updateUserId: existing?.id,
    });
  });

  return { records, issues, skipped };
}

export interface GroupImportRecord {
  rowNumber: number;
  name: string;
  description: string | null;
  is_app_user: boolean;
  tariff_id: string | null;
  isUpdate: boolean;
  updateGroupId?: string;
}

export function buildGroupPreview(
  rows: Record<string, string>[],
  existingGroups: ChargingUserGroup[],
  tariffs: ChargingTariffLite[],
): ImportPreview<GroupImportRecord> {
  const issues: ImportIssue[] = [];
  const records: GroupImportRecord[] = [];
  let skipped = 0;

  rows.forEach((r, i) => {
    const rowNumber = i + 2;
    const name = (r["Name"] ?? "").trim();
    if (!name) {
      issues.push({ row: rowNumber, severity: "error", message: "'Name' fehlt — Zeile wird übersprungen." });
      skipped++;
      return;
    }
    const isAppRaw = (r["App-Nutzer (ja/nein)"] ?? r["App-Nutzer"] ?? "").trim().toLowerCase();
    const is_app_user = ["ja", "yes", "true", "1"].includes(isAppRaw);

    const tariffName = (r["Tarif"] ?? "").trim();
    let tariff_id: string | null = null;
    if (tariffName) {
      tariff_id = findIdByName(tariffs, tariffName);
      if (!tariff_id) {
        issues.push({ row: rowNumber, severity: "warning", message: `Tarif '${tariffName}' nicht gefunden — leer gesetzt.` });
      }
    }
    const existing = existingGroups.find((g) => g.name.trim().toLowerCase() === name.toLowerCase()) ?? null;

    records.push({
      rowNumber,
      name,
      description: (r["Beschreibung"] ?? "").trim() || null,
      is_app_user,
      tariff_id,
      isUpdate: !!existing,
      updateGroupId: existing?.id,
    });
  });

  return { records, issues, skipped };
}

export interface NfcImportRecord {
  rowNumber: number;
  email: string;
  rfid_tag: string;
  userId: string;
}

export function buildNfcPreview(
  rows: Record<string, string>[],
  existingUsers: ChargingUser[],
): ImportPreview<NfcImportRecord> {
  const issues: ImportIssue[] = [];
  const records: NfcImportRecord[] = [];
  let skipped = 0;

  rows.forEach((r, i) => {
    const rowNumber = i + 2;
    const email = (r["E-Mail"] ?? "").trim().toLowerCase();
    const rfid = (r["RFID-Tag"] ?? "").trim();
    if (!email || !rfid) {
      issues.push({ row: rowNumber, severity: "error", message: "'E-Mail' und 'RFID-Tag' sind Pflicht — Zeile wird übersprungen." });
      skipped++;
      return;
    }
    const user = existingUsers.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!user) {
      issues.push({ row: rowNumber, severity: "error", message: `Kein Nutzer mit E-Mail '${email}' gefunden — Zeile wird übersprungen.` });
      skipped++;
      return;
    }
    records.push({ rowNumber, email, rfid_tag: rfid, userId: user.id });
  });

  return { records, issues, skipped };
}

/* -------------------------- Ausführung (DB) ----------------------------- */

export async function executeUserImport(records: UserImportRecord[], tenantId: string) {
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const r of records) {
    const payload = {
      name: r.name,
      email: r.email,
      rfid_tag: r.rfid_tag,
      phone: r.phone,
      group_id: r.group_id,
      tariff_id: r.tariff_id,
      status: r.status,
      notes: r.notes,
    };
    if (r.isUpdate && r.updateUserId) {
      const { error } = await supabase.from("charging_users").update(payload).eq("id", r.updateUserId);
      if (error) failed++; else updated++;
    } else {
      const { error } = await supabase.from("charging_users").insert({ ...payload, tenant_id: tenantId });
      if (error) failed++; else created++;
    }
  }
  return { created, updated, failed };
}

export async function executeGroupImport(records: GroupImportRecord[], tenantId: string) {
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const r of records) {
    const payload = {
      name: r.name,
      description: r.description,
      is_app_user: r.is_app_user,
      tariff_id: r.tariff_id,
    };
    if (r.isUpdate && r.updateGroupId) {
      const { error } = await supabase.from("charging_user_groups").update(payload).eq("id", r.updateGroupId);
      if (error) failed++; else updated++;
    } else {
      const { error } = await supabase.from("charging_user_groups").insert({ ...payload, tenant_id: tenantId });
      if (error) failed++; else created++;
    }
  }
  return { created, updated, failed };
}

export async function executeNfcImport(records: NfcImportRecord[]) {
  let updated = 0;
  let failed = 0;
  for (const r of records) {
    const { error } = await supabase.from("charging_users").update({ rfid_tag: r.rfid_tag }).eq("id", r.userId);
    if (error) failed++; else updated++;
  }
  return { created: 0, updated, failed };
}
