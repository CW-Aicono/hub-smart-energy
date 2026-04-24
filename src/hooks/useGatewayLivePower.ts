import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionName } from "@/lib/gatewayRegistry";
import type { Meter } from "./useMeters";

export interface GatewayLivePowerValue {
  value: number;
  unit: string;
}

const LIVE_POWER_UNITS = new Set(["W", "kW", "MW", "m³", "m³/h"]);

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUnit(unit?: string | null): string | null {
  if (!unit) return null;
  if (unit === "m³") return "m³/h";
  return unit;
}

function extractLivePower(sensor: any): GatewayLivePowerValue | null {
  const primaryUnit = normalizeUnit(sensor.unit);
  const primaryValue = parseNumeric(sensor.rawValue ?? sensor.value);
  if (primaryUnit && LIVE_POWER_UNITS.has(primaryUnit) && primaryValue !== null) {
    // Preserve sign: negative = feed-in/export for bidirectional meters
    return { value: primaryValue, unit: primaryUnit };
  }

  const secondaryUnit = normalizeUnit(sensor.secondaryUnit);
  const secondaryValue = parseNumeric(sensor.secondaryValue);
  if (secondaryUnit && LIVE_POWER_UNITS.has(secondaryUnit) && secondaryValue !== null) {
    return { value: secondaryValue, unit: secondaryUnit };
  }

  return null;
}

export function useGatewayLivePower(meters: Meter[]) {
  const automaticMeters = useMemo(
    () =>
      meters.filter(
        (meter) =>
          !meter.is_archived &&
          meter.capture_type === "automatic" &&
          !!meter.location_integration_id &&
          !!meter.sensor_uuid,
      ),
    [meters],
  );

  const metersByIntegration = useMemo(() => {
    const grouped = new Map<string, Meter[]>();

    automaticMeters.forEach((meter) => {
      const integrationId = meter.location_integration_id;
      if (!integrationId) return;

      const existing = grouped.get(integrationId) ?? [];
      existing.push(meter);
      grouped.set(integrationId, existing);
    });

    return grouped;
  }, [automaticMeters]);

  const integrationIds = useMemo(
    () => Array.from(metersByIntegration.keys()).sort(),
    [metersByIntegration],
  );

  const meterKey = useMemo(
    () => automaticMeters.map((meter) => meter.id).sort().join(","),
    [automaticMeters],
  );

  const query = useQuery({
    queryKey: ["gateway-live-power", meterKey, integrationIds.join(",")],
    enabled: automaticMeters.length > 0,
    staleTime: 60_000,
    // Realtime invalidation pushes fresh data immediately; this 5-min poll is just a safety net.
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<Record<string, GatewayLivePowerValue>> => {
      const values: Record<string, GatewayLivePowerValue> = {};

      const { data: integrationRows, error } = await supabase
        .from("location_integrations")
        .select("id, integration:integrations(type)")
        .in("id", integrationIds);

      if (error) throw error;

      const integrationTypes = new Map<string, string>();
      integrationRows?.forEach((row: any) => {
        const integrationType = row.integration?.type;
        if (integrationType) integrationTypes.set(row.id, integrationType);
      });

      await Promise.all(
        integrationIds.map(async (integrationId) => {
          const metersForIntegration = metersByIntegration.get(integrationId) ?? [];
          if (metersForIntegration.length === 0) return;

          try {
            const edgeFunction = getEdgeFunctionName(integrationTypes.get(integrationId) ?? "");
            // Push-based gateways (gateway-ingest) don't support getSensors – skip them
            if (edgeFunction === "gateway-ingest") return;

            let data: any = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              const res = await supabase.functions.invoke(edgeFunction, {
                body: { locationIntegrationId: integrationId, action: "getSensors" },
              });
              data = res.data;
              const msg = res.error?.message || res.data?.error || "";
              const isTransient = /503|temporarily unavailable|SUPABASE_EDGE_RUNTIME_ERROR/i.test(msg);
              if (!res.error && data?.success) break;
              if (!isTransient) break;
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }

            if (!data?.success || !Array.isArray(data.sensors)) return;

            const sensorsById = new Map<string, any>(
              data.sensors.map((sensor: any) => [sensor.id, sensor]),
            );

            metersForIntegration.forEach((meter) => {
              const sensor = sensorsById.get(meter.sensor_uuid!);
              if (!sensor) return;

              const livePower = extractLivePower(sensor);
              if (!livePower) return;

              values[meter.id] = livePower;
            });
          } catch (invokeError) {
            console.warn(`Failed to fetch live gateway power for ${integrationId}:`, invokeError);
          }
        }),
      );

      return values;
    },
  });

  return {
    livePowerByMeter: query.data ?? {},
    isLoading: query.isLoading,
  };
}