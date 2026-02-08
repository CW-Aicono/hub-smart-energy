import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LoxoneConfig {
  serial_number?: string;
  username?: string;
  password?: string;
}

interface LocationIntegrationStatus {
  id: string;
  is_enabled: boolean;
  sync_status: string | null;
  config: LoxoneConfig | Record<string, unknown>;
}

export interface LocationStatus {
  locationId: string;
  isOnline: boolean;
  totalIntegrations: number;
  onlineIntegrations: number;
  hasUnconfigured: boolean;
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
        .select("id, location_id, is_enabled, sync_status, config")
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
          isOnline: true, // No integrations = considered online
          totalIntegrations: 0,
          onlineIntegrations: 0,
          hasUnconfigured: false,
        });
      });

      // Group integrations by location
      const integrationsByLocation = new Map<string, LocationIntegrationStatus[]>();
      (data || []).forEach((integration) => {
        const locationId = integration.location_id;
        if (!integrationsByLocation.has(locationId)) {
          integrationsByLocation.set(locationId, []);
        }
        integrationsByLocation.get(locationId)!.push(integration as LocationIntegrationStatus);
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
          });
          return;
        }

        let online = 0;
        let hasUnconfigured = false;

        enabledIntegrations.forEach((integration) => {
          const config = integration.config as LoxoneConfig;
          const isConfigured = config?.serial_number && config?.username && config?.password;
          
          if (!isConfigured) {
            hasUnconfigured = true;
          } else if (integration.sync_status === "success") {
            online++;
          }
        });

        // Location is online only if all configured integrations are connected
        const configuredCount = enabledIntegrations.filter((i) => {
          const config = i.config as LoxoneConfig;
          return config?.serial_number && config?.username && config?.password;
        }).length;

        statusMap.set(locationId, {
          locationId,
          isOnline: configuredCount > 0 && online === configuredCount,
          totalIntegrations: total,
          onlineIntegrations: online,
          hasUnconfigured,
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
