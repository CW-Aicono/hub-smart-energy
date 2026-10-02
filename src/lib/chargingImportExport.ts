/**
 * Import/Export für Lade-Nutzer, Nutzergruppen und NFC-Tags.
 *
 * Hinweise:
 *  - Alle Operationen laufen client-seitig über den Supabase-Client.
 *    RLS sorgt dafür, dass nur die eigenen Tenant-Daten geschrieben werden;
 *    zusätzlich stempeln wir tenant_id explizit beim Insert.
 *  - Excel-Dateien werden mit @e965/xlsx erzeugt/gelesen; CSV nutzt denselben Writer
 *    mit dem CSV-Format. So bleibt das Mapping identisch.
 *  - Ein Nutzer kann beliebig viele RFID-Tags mit unterschiedlichen Tag-IDs und
 *    Bezeichnungen haben (Tabelle `charging_user_rfid_tags`, 1:N).
 *    - Users-Sheet: alle Tags/Bezeichnungen werden als `;`-separierte Listen
 *      in den Spalten "RFID-Tag" und "Tag-Bezeichnung" exportiert/importiert
 *      (Positionen sind aufeinander abgestimmt).
 *    - NFC-Sheet: eine Zeile pro Tag; mehrere Zeilen pro E-Mail = mehrere Tags.
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
  "Tag-Bezeichnung",
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

const NFC_HEADERS = ["E-Mail", "RFID-Tag", "Tag-Bezeichnung", "Name"] as const;

const TAG_SEPARATOR = ";";

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

/**
 * Bündelt die effektive Tag-Liste eines Nutzers: bevorzugt aus der Multi-Tag-Tabelle
 * (charging_user_rfid_tags). Falls leer, fällt sie auf das Legacy-Feld zurück.
 */
function effectiveTags(u: ChargingUser): { tag: string; label: string | null }[] {
  if (u.tags && u.tags.length > 0) {
    return u.tags.map((t) => ({ tag: t.tag, label: t.label }));
  }
  if (u.rfid_tag) {
    return [{ tag: u.rfid_tag, label: u.rfid_label }];
  }
  return [];
}

function parseSemicolonList(value: string): string[] {
  if (!value) return [];
  return value
    .split(TAG_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
    ...users.map((u) => {
      const tags = effectiveTags(u);
      // Labels positional aligned; leere Position bleibt leer, damit Reihenfolge passt.
      const tagsCol = tags.map((t) => t.tag).join(TAG_SEPARATOR);
      const labelsCol = tags.map((t) => t.label ?? "").join(TAG_SEPARATOR);
      return [
        u.name,
        u.email ?? "",
        tagsCol,
        labelsCol,
        u.phone ?? "",
        nameById(groups, u.group_id),
        nameById(tariffs, u.tariff_id),
        u.status,
        u.notes ?? "",
      ];
    }),
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
  // Eine Zeile pro Tag. Mehrere Tags pro Nutzer ergeben mehrere Zeilen.
  const tagRows: (string | number | null)[][] = [];
  for (const u of users) {
    for (const t of effectiveTags(u)) {
      tagRows.push([u.email ?? "", t.tag, t.label ?? "", u.name]);
    }
  }
  const rows: (string | number | null)[][] = [[...NFC_HEADERS], ...tagRows];
  writeSheet(rows, format, `nfc-tags_${new Date().toISOString().slice(0, 10)}`);
}

/* -------------------------- Vorlagen ------------------------------------ */

export function downloadTemplate(type: ExportType, format: ExportFormat) {
  const sample: Record<ExportType, (string | number | null)[][]> = {
    users: [
      [...USER_HEADERS],
      [
        "Max Mustermann",
        "max@example.com",
        "04A1B2C3;05D6E7F8",
        "Karte 042;Schlüsselanhänger",
        "+49 170 0000000",
        "Mitarbeiter",
        "Standard-Tarif",
        "active",
        "Mehrere Tags mit ; trennen — Positionen für Tag/Bezeichnung müssen passen.",
      ],
    ],
    groups: [
      [...GROUP_HEADERS],
      ["Mitarbeiter", "Interne Belegschaft", "nein", "Standard-Tarif"],
    ],
    nfc: [
      [...NFC_HEADERS],
      ["max@example.com", "04A1B2C3", "Karte 042", "Max Mustermann"],
      ["max@example.com", "05D6E7F8", "Schlüsselanhänger", "Max Mustermann"],
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
  /** Vollständige Tag-Liste, die nach dem Import für diesen Nutzer aktiv ist. */
  tags: { tag: string; label: string | null }[];
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
    const rowNumber = i + 2;
    const name = (r["Name"] ?? "").trim();
    const email = (r["E-Mail"] ?? "").trim().toLowerCase();
    const tagIdsRaw = (r["RFID-Tag"] ?? "").trim();
    const labelsRaw = (r["Tag-Bezeichnung"] ?? "").trim();
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

    // Tag-Liste: positionsgenau gepaart
    const tagIds = parseSemicolonList(tagIdsRaw).map((t) => t.replace(/\s+/g, "").toUpperCase());
    const labels = parseSemicolonList(labelsRaw);
    if (labels.length > 0 && labels.length !== tagIds.length) {
      issues.push({
        row: rowNumber,
        severity: "warning",
        message: `Anzahl der Tag-Bezeichnungen (${labels.length}) passt nicht zur Anzahl Tags (${tagIds.length}) — fehlende Bezeichnungen bleiben leer.`,
      });
    }
    const seen = new Set<string>();
    const tags: { tag: string; label: string | null }[] = [];
    tagIds.forEach((tag, idx) => {
      if (!tag || seen.has(tag)) return;
      seen.add(tag);
      tags.push({ tag, label: (labels[idx] ?? "").trim() || null });
    });

    // Update vs Insert: Match per E-Mail, sonst per einem der Tags
    const existing =
      (email && existingUsers.find((u) => (u.email ?? "").toLowerCase() === email)) ||
      (tags.length > 0 && existingUsers.find((u) =>
        (u.rfid_tag ?? "").toUpperCase() === tags[0].tag ||
        (u.tags ?? []).some((t) => t.tag.toUpperCase() === tags[0].tag),
      )) ||
      null;

    records.push({
      rowNumber,
      name,
      email: email || null,
      tags,
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
  rfid_label: string | null;
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
    const rfid = (r["RFID-Tag"] ?? "").replace(/\s+/g, "").trim().toUpperCase();
    const label = (r["Tag-Bezeichnung"] ?? "").trim();
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
    records.push({ rowNumber, email, rfid_tag: rfid, rfid_label: label || null, userId: user.id });
  });

  return { records, issues, skipped };
}

/* -------------------------- Ausführung (DB) ----------------------------- */

/**
 * Synchronisiert die komplette Tag-Liste eines Nutzers (delete + insert).
 * Spiegelt den ersten Tag zurück in die Legacy-Spalten rfid_tag/rfid_label.
 */
async function syncUserTags(
  tenantId: string,
  userId: string,
  tags: { tag: string; label: string | null }[],
) {
  const clean: { tag: string; label: string | null }[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const tag = (t.tag ?? "").replace(/\s+/g, "").toUpperCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    clean.push({ tag, label: (t.label ?? "")?.trim() ? t.label : null });
  }
  const del = await supabase.from("charging_user_rfid_tags").delete().eq("user_id", userId);
  if (del.error) throw del.error;
  if (clean.length > 0) {
    const ins = await supabase
      .from("charging_user_rfid_tags")
      .insert(clean.map((t) => ({ tenant_id: tenantId, user_id: userId, tag: t.tag, label: t.label })));
    if (ins.error) throw ins.error;
  }
  const primary = clean[0] ?? null;
  const upd = await supabase
    .from("charging_users")
    .update({ rfid_tag: primary?.tag ?? null, rfid_label: primary?.label ?? null })
    .eq("id", userId);
  if (upd.error) throw upd.error;
}

export async function executeUserImport(records: UserImportRecord[], tenantId: string) {
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const r of records) {
    const payload = {
      name: r.name,
      email: r.email,
      phone: r.phone,
      group_id: r.group_id,
      tariff_id: r.tariff_id,
      status: r.status,
      notes: r.notes,
    };
    try {
      let userId: string;
      if (r.isUpdate && r.updateUserId) {
        const { error } = await supabase.from("charging_users").update(payload).eq("id", r.updateUserId);
        if (error) throw error;
        userId = r.updateUserId;
        updated++;
      } else {
        const { data, error } = await supabase
          .from("charging_users")
          .insert({ ...payload, tenant_id: tenantId })
          .select("id")
          .single();
        if (error) throw error;
        userId = data!.id as string;
        created++;
      }
      await syncUserTags(tenantId, userId, r.tags);
    } catch {
      failed++;
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

/**
 * NFC-Import: Fügt für jede Zeile einen Tag in `charging_user_rfid_tags` ein
 * (oder aktualisiert die Bezeichnung, falls der Tag bereits existiert).
 * Mehrere Zeilen pro E-Mail erzeugen mehrere Tags für denselben Nutzer.
 */
export async function executeNfcImport(records: NfcImportRecord[], tenantId: string) {
  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const r of records) {
    try {
      // Existiert dieser Tag bereits in diesem Mandanten?
      const { data: existing, error: selErr } = await supabase
        .from("charging_user_rfid_tags")
        .select("id, user_id")
        .eq("tenant_id", tenantId)
        .ilike("tag", r.rfid_tag)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing) {
        const { error } = await supabase
          .from("charging_user_rfid_tags")
          .update({ user_id: r.userId, tag: r.rfid_tag, label: r.rfid_label })
          .eq("id", existing.id);
        if (error) throw error;
        updated++;
      } else {
        const { error } = await supabase
          .from("charging_user_rfid_tags")
          .insert({ tenant_id: tenantId, user_id: r.userId, tag: r.rfid_tag, label: r.rfid_label });
        if (error) throw error;
        created++;
      }

      // Legacy-Spiegel: falls Nutzer noch keinen rfid_tag hat, ersten Tag dort eintragen.
      const { data: u } = await supabase
        .from("charging_users")
        .select("rfid_tag")
        .eq("id", r.userId)
        .maybeSingle();
      if (!u?.rfid_tag) {
        await supabase
          .from("charging_users")
          .update({ rfid_tag: r.rfid_tag, rfid_label: r.rfid_label })
          .eq("id", r.userId);
      }
    } catch {
      failed++;
    }
  }
  return { created, updated, failed };
}
