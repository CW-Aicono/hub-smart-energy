import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FundingProgram {
  id: string;
  name: string;
  level: string;
  state: string | null;
  municipality: string | null;
  technology: string[];
  funding_type: string;
  amount_description: string | null;
  max_amount: number | null;
  min_capacity: number | null;
  valid_from: string;
  valid_until: string | null;
  url: string | null;
  is_active: boolean;
  notes: string | null;
}

export function useFundingPrograms(filters?: { state?: string; technology?: string }) {
  return useQuery({
    queryKey: ["funding-programs", filters],
    queryFn: async () => {
      let query = supabase
        .from("funding_programs" as any)
        .select("*")
        .eq("is_active", true)
        .order("level")
        .order("name");

      if (filters?.state) {
        query = query.or(`state.is.null,state.eq.${filters.state}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      let results = data as unknown as FundingProgram[];
      if (filters?.technology) {
        results = results.filter((fp) => fp.technology?.includes(filters.technology!));
      }
      return results;
    },
  });
}
