import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AccessorySuggestion {
  device_catalog_id: string;
  hersteller: string;
  modell: string;
  vk_preis: number;
  installations_pauschale: number;
  geraete_klasse: string;
  bild_url: string | null;
  beschreibung: string | null;
  menge: number;
  source_recommendation_id: string;
  source_device_name: string;
  notiz: string | null;
  prio: number;
}

interface SuggestionsResponse {
  required: AccessorySuggestion[];
  recommended: AccessorySuggestion[];
}

interface Args {
  projectId?: string;
  measurementPointId?: string;
  enabled?: boolean;
}

export function useAccessorySuggestions({ projectId, measurementPointId, enabled = true }: Args) {
  const key = ["accessory-suggestions", projectId ?? null, measurementPointId ?? null];
  const query = useQuery<SuggestionsResponse>({
    queryKey: key,
    enabled: enabled && (!!projectId || !!measurementPointId),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("sales-suggest-accessories", {
        body: { project_id: projectId, measurement_point_id: measurementPointId },
      });
      if (error) throw error;
      return (data ?? { required: [], recommended: [] }) as SuggestionsResponse;
    },
  });
  return query;
}

export function useInvalidateAccessorySuggestions() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["accessory-suggestions"] });
}
