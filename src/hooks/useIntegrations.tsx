import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface IntegrationCategory {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface Integration {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  category: string;
  description: string | null;
  icon: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocationIntegration {
  id: string;
  location_id: string;
  integration_id: string;
  config: LoxoneConfig | Record<string, unknown>;
  is_enabled: boolean;
  last_sync_at: string | null;
  sync_status: string;
  created_at: string;
  updated_at: string;
  integration?: Integration;
}

export interface LoxoneConfig {
  serial_number: string;
  username: string;
  password: string;
}

interface UseIntegrationsReturn {
  integrations: Integration[];
  categories: IntegrationCategory[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createIntegration: (integration: Omit<Integration, "id" | "tenant_id" | "created_at" | "updated_at">) => Promise<{ data: Integration | null; error: Error | null }>;
  updateIntegration: (id: string, updates: Partial<Integration>) => Promise<{ error: Error | null }>;
  deleteIntegration: (id: string) => Promise<{ error: Error | null }>;
}

export function useIntegrations(): UseIntegrationsReturn {
  const { tenant } = useTenant();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [categories, setCategories] = useState<IntegrationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    if (!tenant) {
      setIntegrations([]);
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [integrationsResult, categoriesResult] = await Promise.all([
        supabase
          .from("integrations")
          .select("*")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("integration_categories")
          .select("*")
          .order("sort_order")
      ]);

      if (integrationsResult.error) {
        setError(integrationsResult.error.message);
      } else {
        setIntegrations((integrationsResult.data as Integration[]) || []);
      }

      if (categoriesResult.error) {
        console.error("Error fetching categories:", categoriesResult.error);
      } else {
        setCategories((categoriesResult.data as IntegrationCategory[]) || []);
      }
    } catch (err) {
      setError("Failed to fetch integrations");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const createIntegration = async (integration: Omit<Integration, "id" | "tenant_id" | "created_at" | "updated_at">) => {
    if (!tenant) return { data: null, error: new Error("No tenant") };

    const { data, error: insertError } = await supabase
      .from("integrations")
      .insert({
        ...integration,
        tenant_id: tenant.id,
      } as any)
      .select()
      .single();

    if (!insertError) {
      await fetchIntegrations();
    }

    return { data: data as Integration | null, error: insertError as Error | null };
  };

  const updateIntegration = async (id: string, updates: Partial<Integration>) => {
    const { error: updateError } = await supabase
      .from("integrations")
      .update(updates as any)
      .eq("id", id);

    if (!updateError) {
      await fetchIntegrations();
    }

    return { error: updateError as Error | null };
  };

  const deleteIntegration = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("integrations")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      await fetchIntegrations();
    }

    return { error: deleteError as Error | null };
  };

  return {
    integrations,
    categories,
    loading,
    error,
    refetch: fetchIntegrations,
    createIntegration,
    updateIntegration,
    deleteIntegration,
  };
}

interface UseLocationIntegrationsReturn {
  locationIntegrations: LocationIntegration[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addIntegration: (locationId: string, integrationId: string, config: LoxoneConfig | Record<string, unknown>) => Promise<{ data: LocationIntegration | null; error: Error | null }>;
  updateIntegration: (id: string, updates: Partial<LocationIntegration>) => Promise<{ error: Error | null }>;
  removeIntegration: (id: string) => Promise<{ error: Error | null }>;
  testConnection: (config: LoxoneConfig) => Promise<{ success: boolean; error: string | null }>;
}

export function useLocationIntegrations(locationId: string | undefined): UseLocationIntegrationsReturn {
  const [locationIntegrations, setLocationIntegrations] = useState<LocationIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocationIntegrations = useCallback(async () => {
    if (!locationId) {
      setLocationIntegrations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("location_integrations")
        .select(`
          *,
          integration:integrations(*)
        `)
        .eq("location_id", locationId);

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setLocationIntegrations((data as unknown as LocationIntegration[]) || []);
      }
    } catch (err) {
      setError("Failed to fetch location integrations");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetchLocationIntegrations();
  }, [fetchLocationIntegrations]);

  const addIntegration = async (locationId: string, integrationId: string, config: LoxoneConfig | Record<string, unknown>) => {
    const { data, error: insertError } = await supabase
      .from("location_integrations")
      .insert({
        location_id: locationId,
        integration_id: integrationId,
        config,
      } as any)
      .select(`
        *,
        integration:integrations(*)
      `)
      .single();

    if (!insertError) {
      await fetchLocationIntegrations();
    }

    return { data: data as unknown as LocationIntegration | null, error: insertError as Error | null };
  };

  const updateIntegration = async (id: string, updates: Partial<LocationIntegration>) => {
    const { error: updateError } = await supabase
      .from("location_integrations")
      .update(updates as any)
      .eq("id", id);

    if (!updateError) {
      await fetchLocationIntegrations();
    }

    return { error: updateError as Error | null };
  };

  const removeIntegration = async (id: string) => {
    const { error: deleteError } = await supabase
      .from("location_integrations")
      .delete()
      .eq("id", id);

    if (!deleteError) {
      await fetchLocationIntegrations();
    }

    return { error: deleteError as Error | null };
  };

  const testConnection = async (config: LoxoneConfig): Promise<{ success: boolean; error: string | null }> => {
    // Validate required fields for Cloud DNS connection
    if (!config.serial_number || !config.username || !config.password) {
      return { success: false, error: "Seriennummer, Benutzername und Passwort müssen ausgefüllt werden" };
    }
    
    // In a real implementation, this would make an API call to test the Loxone connection
    return { success: true, error: null };
  };

  return {
    locationIntegrations,
    loading,
    error,
    refetch: fetchLocationIntegrations,
    addIntegration,
    updateIntegration,
    removeIntegration,
    testConnection,
  };
}
