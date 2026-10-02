import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { InstalledLoxoneTemplate } from "@/components/locations/AutomationRuleBuilder";

/**
 * Aggregierte Sicht der installierten AICO_-Loxone-Bausteine über mehrere
 * Standorte hinweg. Wird vom Multi-Location-Automation-Editor
 * (src/pages/Automation.tsx) genutzt, damit Templates auch dann
 * ausgewählt werden können, wenn sie auf mindestens einem der Ziel-Standorte
 * installiert sind.
 */
export interface TemplateLocationBinding {
  locationId: string;
  locationIntegrationId: string;
  installedVersion: string | null;
}

export interface UseInstalledTemplatesMultiResult {
  installedTemplates: InstalledLoxoneTemplate[];
  /** Map `${template_key}::${instance_id ?? ""}` → verfügbare Standorte */
  availabilityByKey: Map<string, TemplateLocationBinding[]>;
  loading: boolean;
}

const availabilityKey = (templateKey: string, instanceId: string | null | undefined) =>
  `${templateKey}::${instanceId ?? ""}`;

export function useInstalledTemplatesMulti(
  locationIds: string[],
): UseInstalledTemplatesMultiResult {
  const [installedTemplates, setInstalledTemplates] = useState<InstalledLoxoneTemplate[]>([]);
  const [availabilityByKey, setAvailabilityByKey] = useState<Map<string, TemplateLocationBinding[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);

  const idsKey = useMemo(() => [...locationIds].sort().join(","), [locationIds]);

  useEffect(() => {
    let cancelled = false;
    if (locationIds.length === 0) {
      setInstalledTemplates([]);
      setAvailabilityByKey(new Map());
      return;
    }

    (async () => {
      setLoading(true);

      const [{ data: inst }, { data: reg }, { data: locInt }] = await Promise.all([
        supabase
          .from("location_loxone_templates")
          .select("template_key, instance_id, installed_version, location_id")
          .in("location_id", locationIds),
        supabase
          .from("loxone_template_registry")
          .select("template_key, title, parameters")
          .eq("is_active", true),
        supabase
          .from("location_integrations")
          .select("id, location_id, integrations!inner(type)")
          .in("location_id", locationIds),
      ]);

      if (cancelled) return;

      const regMap = new Map((reg ?? []).map((r: any) => [r.template_key, r]));

      // Location → passendes Loxone-Miniserver-locationIntegrationId (bevorzugt)
      const gwByLocation = new Map<string, string>();
      for (const li of (locInt as any[] | null) ?? []) {
        const t = li.integrations?.type as string | undefined;
        if (t === "loxone_miniserver" || t === "loxone_miniserver_go") {
          if (!gwByLocation.has(li.location_id)) gwByLocation.set(li.location_id, li.id);
        }
      }

      const availability = new Map<string, TemplateLocationBinding[]>();
      const uniqueByKey = new Map<string, InstalledLoxoneTemplate>();

      for (const row of (inst as any[] | null) ?? []) {
        const key = availabilityKey(row.template_key, row.instance_id);
        const gwId = gwByLocation.get(row.location_id);
        if (!gwId) continue; // Standort hat keinen Miniserver → nicht ausführbar

        const bindings = availability.get(key) ?? [];
        bindings.push({
          locationId: row.location_id,
          locationIntegrationId: gwId,
          installedVersion: row.installed_version ?? null,
        });
        availability.set(key, bindings);

        if (!uniqueByKey.has(key)) {
          const r = regMap.get(row.template_key);
          uniqueByKey.set(key, {
            template_key: row.template_key,
            instance_id: row.instance_id,
            installed_version: row.installed_version ?? null,
            title: (r as any)?.title ?? row.template_key,
            parameters: Array.isArray((r as any)?.parameters)
              ? ((r as any).parameters as any[]).map((p) => ({ ...p, name: p.name ?? p.key }))
              : [],
          });
        }
      }

      setInstalledTemplates(Array.from(uniqueByKey.values()));
      setAvailabilityByKey(availability);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { installedTemplates, availabilityByKey, loading };
}

export { availabilityKey };
