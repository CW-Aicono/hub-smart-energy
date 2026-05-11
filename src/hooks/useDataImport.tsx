import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";
import {
  parseGermanNumber,
  parseFlexibleDate,
  parseFlexibleTimestamp,
  type MappableField,
  type ParsedRow,
} from "@/lib/csvParser";

export type ImportType = "readings" | "consumption" | "consumption_monthly" | "power_5min";
export type ConflictStrategy = "skip" | "overwrite" | "insert_new";

export interface ValidationIssue {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidatedRow {
  rowIndex: number;
  meterId: string | null;
  meterNumber: string;
  date: string;            // YYYY-MM-DD (for readings + period totals)
  bucket?: string;         // ISO timestamp (for power 5min)
  value: number;
  notes?: string;
  energyType?: string;
  /** Per-row destination — supports auto-routing for export round-trip */
  importType: ImportType;
  issues: ValidationIssue[];
  excluded: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

interface MeterLookup {
  id: string;
  meter_number: string | null;
  name: string;
  energy_type: string;
  location_id: string | null;
}

interface LocationLookup {
  id: string;
  name: string;
}

/** Map "Quelle" column values from the export back to import types. */
function detectImportTypeFromSource(source: string | undefined): ImportType | null {
  if (!source) return null;
  const s = source.toLowerCase().trim();
  if (s.includes("ablesung")) return "readings";
  if (s.includes("monat")) return "consumption_monthly";
  if (s.includes("5min") || s.includes("leistung")) return "power_5min";
  if (s.includes("verbrauch") || s.includes("tag")) return "consumption";
  return null;
}

export function useDataImport() {
  const { tenantId } = useTenantQuery();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);

  const validateRows = useCallback(
    async (
      rows: ParsedRow[],
      mapping: Record<string, MappableField>,
      defaultImportType: ImportType
    ): Promise<ValidatedRow[]> => {
      if (!tenantId) return [];

      const [{ data: metersData }, { data: locationsData }] = await Promise.all([
        supabase
          .from("meters")
          .select("id, meter_number, name, energy_type, location_id")
          .eq("tenant_id", tenantId),
        supabase.from("locations").select("id, name").eq("tenant_id", tenantId),
      ]);

      const meters = (metersData ?? []) as MeterLookup[];
      const locations = (locationsData ?? []) as LocationLookup[];

      const meterByNumber = new Map<string, MeterLookup>();
      const meterByNameLoc = new Map<string, MeterLookup>();
      meters.forEach((m) => {
        if (m.meter_number) meterByNumber.set(m.meter_number.toLowerCase().trim(), m);
        const loc = locations.find((l) => l.id === m.location_id);
        if (loc) {
          meterByNameLoc.set(`${loc.name.toLowerCase().trim()}__${m.name.toLowerCase().trim()}`, m);
        }
        meterByNameLoc.set(`__${m.name.toLowerCase().trim()}`, m);
      });

      const colFor = (field: MappableField): string | undefined =>
        Object.entries(mapping).find(([, v]) => v === field)?.[0];

      const meterCol = colFor("meter_number");
      const meterNameCol = colFor("meter_name");
      const locationCol = colFor("location_name");
      const dateCol = colFor("date");
      const timeCol = colFor("time");
      const valueCol = colFor("value");
      const notesCol = colFor("notes");
      const energyCol = colFor("energy_type");
      const sourceCol = colFor("source_block");

      const validated: ValidatedRow[] = rows.map((row, idx) => {
        const issues: ValidationIssue[] = [];
        const meterNumber = meterCol ? row[meterCol]?.trim() ?? "" : "";
        const meterName = meterNameCol ? row[meterNameCol]?.trim() ?? "" : "";
        const locationName = locationCol ? row[locationCol]?.trim() ?? "" : "";
        const rawDate = dateCol ? row[dateCol]?.trim() ?? "" : "";
        const rawTime = timeCol ? row[timeCol]?.trim() : undefined;
        const rawValue = valueCol ? row[valueCol]?.trim() ?? "" : "";
        const notes = notesCol ? row[notesCol]?.trim() : undefined;
        const energyType = energyCol ? row[energyCol]?.trim() : undefined;
        const sourceLabel = sourceCol ? row[sourceCol]?.trim() : undefined;

        // Per-row import type (allows mixed-content exports to be re-imported)
        const detectedType = detectImportTypeFromSource(sourceLabel);
        const importType: ImportType = detectedType ?? defaultImportType;

        // Meter lookup: number first, then name+location, then name only
        let meter: MeterLookup | undefined;
        if (meterNumber) {
          meter = meterByNumber.get(meterNumber.toLowerCase());
        }
        if (!meter && meterName) {
          const key = `${locationName.toLowerCase().trim()}__${meterName.toLowerCase().trim()}`;
          meter = meterByNameLoc.get(key) ?? meterByNameLoc.get(`__${meterName.toLowerCase().trim()}`);
        }
        if (!meterNumber && !meterName) {
          issues.push({ row: idx, field: "meter", message: "Zähler-Identifikation fehlt", severity: "error" });
        } else if (!meter) {
          issues.push({
            row: idx,
            field: "meter",
            message: `Zähler "${meterNumber || meterName}" nicht gefunden`,
            severity: "error",
          });
        }

        // Date / bucket
        let dateOnly = "";
        let bucket: string | undefined;
        if (importType === "power_5min") {
          const ts = parseFlexibleTimestamp(rawDate, rawTime);
          if (!rawDate) {
            issues.push({ row: idx, field: "date", message: "Datum/Zeit fehlt", severity: "error" });
          } else if (!ts) {
            issues.push({ row: idx, field: "date", message: `Ungültige Datum/Zeit: "${rawDate} ${rawTime ?? ""}"`, severity: "error" });
          } else {
            bucket = ts;
            dateOnly = ts.slice(0, 10);
            const minute = new Date(ts).getUTCMinutes();
            if (minute % 5 !== 0) {
              issues.push({ row: idx, field: "time", message: "Zeit muss auf 5 Minuten ausgerichtet sein", severity: "warning" });
            }
          }
        } else {
          const parsed = parseFlexibleDate(rawDate);
          if (!rawDate) {
            issues.push({ row: idx, field: "date", message: "Datum fehlt", severity: "error" });
          } else if (!parsed) {
            issues.push({ row: idx, field: "date", message: `Ungültiges Datum: "${rawDate}"`, severity: "error" });
          } else {
            dateOnly = parsed;
            const d = new Date(parsed);
            if (d > new Date(Date.now() + 24 * 60 * 60 * 1000)) {
              issues.push({ row: idx, field: "date", message: "Datum liegt in der Zukunft", severity: "warning" });
            }
            if (importType === "consumption_monthly" && !parsed.endsWith("-01")) {
              issues.push({ row: idx, field: "date", message: "Monatsdatum muss der 1. eines Monats sein", severity: "warning" });
            }
          }
        }

        // Value
        const parsedValue = parseGermanNumber(rawValue);
        if (!rawValue) {
          issues.push({ row: idx, field: "value", message: "Wert fehlt", severity: "error" });
        } else if (parsedValue === null) {
          issues.push({ row: idx, field: "value", message: `Ungültiger Wert: "${rawValue}"`, severity: "error" });
        }

        return {
          rowIndex: idx,
          meterId: meter?.id ?? null,
          meterNumber: meterNumber || meterName,
          date: dateOnly,
          bucket,
          value: parsedValue ?? 0,
          notes,
          energyType: energyType || meter?.energy_type,
          importType,
          issues,
          excluded: issues.some((i) => i.severity === "error"),
        };
      });

      // Duplicate detection per (meter, date/bucket, importType)
      const seen = new Map<string, number>();
      validated.forEach((r, idx) => {
        if (!r.meterId) return;
        const key = `${r.importType}__${r.meterId}__${r.bucket || r.date}`;
        if (seen.has(key)) {
          r.issues.push({ row: idx, field: "date", message: "Mögliches Duplikat", severity: "warning" });
        } else {
          seen.set(key, idx);
        }
      });

      return validated;
    },
    [tenantId]
  );

  const executeImport = useCallback(
    async (
      validatedRows: ValidatedRow[],
      _defaultImportType: ImportType,
      conflictStrategy: ConflictStrategy = "skip"
    ): Promise<ImportResult> => {
      if (!tenantId) return { imported: 0, skipped: 0, errors: 0 };

      setImporting(true);
      setProgress(0);

      const eligible = validatedRows.filter((r) => !r.excluded && r.meterId);
      const skipped = validatedRows.length - eligible.length;
      let imported = 0;
      let errors = 0;

      // Group by per-row importType so each batch hits the right table
      const groups = new Map<ImportType, ValidatedRow[]>();
      eligible.forEach((r) => {
        const arr = groups.get(r.importType) ?? [];
        arr.push(r);
        groups.set(r.importType, arr);
      });

      const totalRows = eligible.length || 1;
      let processed = 0;
      const batchSize = 200;

      for (const [type, rows] of groups.entries()) {
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          let error: { message: string } | null = null;

          if (type === "readings") {
            const inserts = batch.map((r) => ({
              meter_id: r.meterId!,
              tenant_id: tenantId,
              value: r.value,
              reading_date: r.date,
              capture_method: "csv_import",
              notes: r.notes || null,
            }));
            ({ error } = await supabase.from("meter_readings").insert(inserts));
          } else if (type === "consumption" || type === "consumption_monthly") {
            const periodType = type === "consumption_monthly" ? "month" : "day";
            const inserts = batch.map((r) => ({
              meter_id: r.meterId!,
              tenant_id: tenantId,
              period_type: periodType,
              period_start: periodType === "month" && !r.date.endsWith("-01")
                ? r.date.slice(0, 7) + "-01"
                : r.date,
              total_value: r.value,
              energy_type: r.energyType || "strom",
              source: "csv_import",
            }));
            const q = supabase.from("meter_period_totals");
            if (conflictStrategy === "overwrite") {
              ({ error } = await q.upsert(inserts, { onConflict: "meter_id,period_type,period_start" }));
            } else if (conflictStrategy === "insert_new") {
              ({ error } = await q.upsert(inserts, { onConflict: "meter_id,period_type,period_start", ignoreDuplicates: true }));
            } else {
              ({ error } = await q.upsert(inserts, { onConflict: "meter_id,period_type,period_start", ignoreDuplicates: true }));
            }
          } else if (type === "power_5min") {
            const inserts = batch.map((r) => ({
              meter_id: r.meterId!,
              tenant_id: tenantId,
              bucket: r.bucket!,
              power_avg: r.value,
              power_max: r.value,
              sample_count: 1,
              energy_type: r.energyType || "strom",
            }));
            const q = supabase.from("meter_power_readings_5min");
            if (conflictStrategy === "overwrite") {
              ({ error } = await q.upsert(inserts, { onConflict: "meter_id,bucket" }));
            } else {
              ({ error } = await q.upsert(inserts, { onConflict: "meter_id,bucket", ignoreDuplicates: true }));
            }
          }

          if (error) {
            console.error(`Batch insert error (${type}):`, error);
            errors += batch.length;
          } else {
            imported += batch.length;
          }
          processed += batch.length;
          setProgress(Math.round((processed / totalRows) * 100));
        }
      }

      queryClient.invalidateQueries({ queryKey: ["meter_readings"] });
      queryClient.invalidateQueries({ queryKey: ["meter_period_totals"] });
      queryClient.invalidateQueries({ queryKey: ["energy-data"] });

      setImporting(false);
      setProgress(100);

      return { imported, skipped, errors };
    },
    [tenantId, queryClient]
  );

  return { validateRows, executeImport, progress, importing };
}
