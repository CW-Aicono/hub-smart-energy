import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePlatformStats() {
  const { data: stats = [], isLoading } = useQuery({
    queryKey: ["platform-statistics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_statistics")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: tenantCount = 0 } = useQuery({
    queryKey: ["platform-tenant-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tenants")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: userCount = 0 } = useQuery({
    queryKey: ["platform-user-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: locationCount = 0 } = useQuery({
    queryKey: ["platform-location-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("locations")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  return { stats, tenantCount, userCount, locationCount, isLoading };
}
