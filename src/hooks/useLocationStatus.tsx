import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LocationIntegrationStatus {
  id: string;
  is_enabled: boolean;
  sync_status: string | null;
  config: Record<string, unknown>;
  integration_name: string;
  integration_type: string;
}

export interface LocationStatus {
  locationId: string;
  isOnline: boolean;
  totalIntegrations: number;
  onlineIntegrations: number;
  hasUnconfigured: boolean;
  unconfiguredNames: string[];
}

/** Check if an integration has been fully configured based on its type */
function isIntegrationConfigured(type: string, config: Record<string, unknown>): boolean {
  if (!config) return false;
  switch (type) {
    case "aicono_gateway":
      return true;
    case "loxone_miniserver":
      return !!(config.serial_number && config.username && config.password);
    case "omada_cloud":
      return !!(config.api_url && config.client_id && config.client_secret && config.omada_id);
    case "shelly_cloud":
      return !!(config.auth_key && config.server_uri);
    case "abb_free_at_home":
      return !!(config.system_url && config.username && config.password);
    case "siemens_building_x":
      return !!(config.api_url && config.client_id && config.client_secret);
    case "tuya_cloud":
      return !!(config.access_id && config.access_secret);
    case "homematic_ip":
      return !!(config.access_point_id && config.auth_token);
    default:
      // For unknown types, consider configured if config has at least one non-empty value
      return Object.values(config).some(v => v !== null && v !== undefined && v !== "");
  }
}

/** Map integration type to a short display name */
function integrationShortName(type: string, name: string): string {
  const typeMap: Record<string, string> = {
    aicono_gateway: "AICONO Gateway",
    loxone_miniserver: "Loxone",
    omada_cloud: "TP-Link",
    shelly_cloud: "Shelly",
    abb_free_at_home: "ABB",
    siemens_building_x: "Siemens",
    tuya_cloud: "Tuya",
    homematic_ip: "Homematic",
  };
  return typeMap[type] || name;
}

interface UseLocationStatusReturn {
  locationStatuses: Map<string, LocationStatus>;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useLocationStatus(locationIds: string[]): UseLocationStatusReturn {
  const [locationStatuses, setLocationStatuses] = useState<Map<string, LocationStatus>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchStatuses = useCallback(async () => {
    if (locationIds.length === 0) {
      setLocationStatuses(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("location_integrations")
        .select("id, location_id, is_enabled, sync_status, config, integration:integrations!inner(name, type)")
        .in("location_id", locationIds);

      if (error) {
        console.error("Error fetching location integrations:", error);
        setLoading(false);
        return;
      }

      const statusMap = new Map<string, LocationStatus>();

      // Initialize all locations with default status
      locationIds.forEach((id) => {
        statusMap.set(id, {
          locationId: id,
          isOnline: true,
          totalIntegrations: 0,
          onlineIntegrations: 0,
          hasUnconfigured: false,
          unconfiguredNames: [],
        });
      });

      // Group integrations by location
      const integrationsByLocation = new Map<string, LocationIntegrationStatus[]>();
      (data || []).forEach((row: any) => {
        const locationId = row.location_id;
        if (!integrationsByLocation.has(locationId)) {
          integrationsByLocation.set(locationId, []);
        }
        integrationsByLocation.get(locationId)!.push({
          id: row.id,
          is_enabled: row.is_enabled,
          sync_status: row.sync_status,
          config: (row.config || {}) as Record<string, unknown>,
          integration_name: row.integration?.name || "",
          integration_type: row.integration?.type || "",
        });
      });

      // Calculate status for each location
      integrationsByLocation.forEach((integrations, locationId) => {
        const enabledIntegrations = integrations.filter((i) => i.is_enabled);
        const total = enabledIntegrations.length;
        
        if (total === 0) {
          statusMap.set(locationId, {
            locationId,
            isOnline: true,
            totalIntegrations: 0,
            onlineIntegrations: 0,
            hasUnconfigured: false,
            unconfiguredNames: [],
          });
          return;
        }

        let online = 0;
        const unconfiguredNames: string[] = [];

        enabledIntegrations.forEach((integration) => {
          const configured = isIntegrationConfigured(integration.integration_type, integration.config);
          
          if (!configured) {
            unconfiguredNames.push(integrationShortName(integration.integration_type, integration.integration_name));
          } else if (integration.sync_status === "success") {
            online++;
          }
        });

        const configuredCount = enabledIntegrations.length - unconfiguredNames.length;

        statusMap.set(locationId, {
          locationId,
          // Online if at least one configured integration is connected
          isOnline: online > 0,
          totalIntegrations: total,
          onlineIntegrations: online,
          hasUnconfigured: unconfiguredNames.length > 0,
          unconfiguredNames,
        });
      });

      setLocationStatuses(statusMap);
    } catch (err) {
      console.error("Failed to fetch location statuses:", err);
    } finally {
      setLoading(false);
    }
  }, [locationIds.join(",")]);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  return {
    locationStatuses,
    loading,
    refetch: fetchStatuses,
  };
}
