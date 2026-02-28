import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OcppGuide {
  id: string;
  charger_model_id: string | null;
  vendor: string;
  model: string;
  content_md: string;
  ocpp_version: string;
  difficulty: string;
  created_at: string;
  updated_at: string;
}

export function useOcppGuides() {
  const { data: guides = [], isLoading } = useQuery({
    queryKey: ["ocpp-integration-guides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ocpp_integration_guides")
        .select("*")
        .order("vendor")
        .order("model");
      if (error) throw error;
      return data as unknown as OcppGuide[];
    },
  });

  const vendors = [...new Set(guides.map((g) => g.vendor))].sort();

  const getModelsForVendor = (vendor: string) =>
    [...new Set(guides.filter((g) => g.vendor === vendor).map((g) => g.model))].sort();

  return { guides, isLoading, vendors, getModelsForVendor };
}
