import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";
import { parseGermanNumber, parseFlexibleDate, type MappableField, type ParsedRow } from "@/lib/csvParser";

export type ImportType = "readings" | "consumption";

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
  date: string; // YYYY-MM-DD
  value: number;
  notes?: string;
  energyType?: string;
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
  meter_number: string;
  energy_type: string;
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
      importType: ImportType
    ): Promise<ValidatedRow[]> => {
      if (!tenantId) return [];

      // Fetch all meters for this tenant
      const { data: metersData } = await supabase
        .from("meters")
        .select("id, meter_number, energy_type")
        .eq("tenant_id", tenantId);

      const meters = (metersData ?? []) as MeterLookup[];
      const meterMap = new Map<string, MeterLookup>();
      meters.forEach((m) => {
        if (m.meter_number) meterMap.set(m.meter_number.toLowerCase().trim(), m);
      });

      // Get the mapped column names
      const colFor = (field: MappableField): string | undefined => {
        return Object.entries(mapping).find(([, v]) => v === field)?.[0];
      };

      const meterCol = colFor("meter_number");
      const dateCol = colFor("date");
      const valueCol = colFor("value");
      const notesCol = colFor("notes");
      const energyCol = colFor("energy_type");

      const validated: ValidatedRow[] = rows.map((row, idx) => {
        const issues: ValidationIssue[] = [];
        const meterNumber = meterCol ? row[meterCol]?.trim() ?? "" : "";
        const rawDate = dateCol ? row[dateCol]?.trim() ?? "" : "";
        const rawValue = valueCol ? row[valueCol]?.trim() ?? "" : "";
        const notes = notesCol ? row[notesCol]?.trim() : undefined;
        const energyType = energyCol ? row[energyCol]?.trim() : undefined;

        // Meter lookup
        const meter = meterNumber ? meterMap.get(meterNumber.toLowerCase()) : undefined;
        if (!meterNumber) {
          issues.push({ row: idx, field: "meter_number", message: "Zählernummer fehlt", severity: "error" });
        } else if (!meter) {
          issues.push({ row: idx, field: "meter_number", message: `Zähler "${meterNumber}" nicht gefunden`, severity: "error" });
        }

        // Date
        const parsedDate = parseFlexibleDate(rawDate);
        if (!rawDate) {
          issues.push({ row: idx, field: "date", message: "Datum fehlt", severity: "error" });
        } else if (!parsedDate) {
          issues.push({ row: idx, field: "date", message: `Ungültiges Datum: "${rawDate}"`, severity: "error" });
        } else {
          const d = new Date(parsedDate);
          if (d > new Date()) {
            issues.push({ row: idx, field: "date", message: "Datum liegt in der Zukunft", severity: "warning" });
          }
        }

        // Value
        const parsedValue = parseGermanNumber(rawValue);
        if (!rawValue) {
          issues.push({ row: idx, field: "value", message: "Wert fehlt", severity: "error" });
        } else if (parsedValue === null) {
          issues.push({ row: idx, field: "value", message: `Ungültiger Wert: "${rawValue}"`, severity: "error" });
        } else if (parsedValue < 0) {
          issues.push({ row: idx, field: "value", message: "Negativer Wert", severity: "warning" });
        }

        return {
          rowIndex: idx,
          meterId: meter?.id ?? null,
          meterNumber,
          date: parsedDate ?? "",
          value: parsedValue ?? 0,
          notes,
          energyType: energyType || meter?.energy_type,
          issues,
          excluded: issues.some((i) => i.severity === "error"),
        };
      });

      // Duplicate detection
      const seen = new Map<string, number>();
      validated.forEach((r, idx) => {
        if (r.meterId && r.date) {
          const key = `${r.meterId}__${r.date}`;
          if (seen.has(key)) {
            r.issues.push({ row: idx, field: "date", message: "Mögliches Duplikat", severity: "warning" });
          } else {
            seen.set(key, idx);
          }
        }
      });

      return validated;
    },
    [tenantId]
  );

  const executeImport = useCallback(
    async (validatedRows: ValidatedRow[], importType: ImportType): Promise<ImportResult> => {
      if (!tenantId) return { imported: 0, skipped: 0, errors: 0 };

      setImporting(true);
      setProgress(0);

      const rowsToImport = validatedRows.filter((r) => !r.excluded && r.meterId && r.date);
      const batchSize = 100;
      let imported = 0;
      let errors = 0;
      const skipped = validatedRows.length - rowsToImport.length;

      for (let i = 0; i < rowsToImport.length; i += batchSize) {
        const batch = rowsToImport.slice(i, i + batchSize);

        if (importType === "readings") {
          const inserts = batch.map((r) => ({
            meter_id: r.meterId!,
            tenant_id: tenantId,
            value: r.value,
            reading_date: r.date,
            capture_method: "csv_import",
            notes: r.notes || null,
          }));
          const { error } = await supabase.from("meter_readings").insert(inserts);
          if (error) {
            console.error("Batch insert error:", error);
            errors += batch.length;
          } else {
            imported += batch.length;
          }
        } else {
          // consumption -> meter_period_totals
          const inserts = batch.map((r) => {
            // Determine period_type from date
            const isMonthStart = r.date.endsWith("-01");
            return {
              meter_id: r.meterId!,
              tenant_id: tenantId,
              period_type: isMonthStart ? "month" : "day",
              period_start: r.date,
              total_value: r.value,
              energy_type: r.energyType || "strom",
              source: "csv_import",
            };
          });
          const { error } = await supabase.from("meter_period_totals").insert(inserts);
          if (error) {
            console.error("Batch insert error:", error);
            errors += batch.length;
          } else {
            imported += batch.length;
          }
        }

        setProgress(Math.round(((i + batch.length) / rowsToImport.length) * 100));
      }

      // Invalidate caches
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
