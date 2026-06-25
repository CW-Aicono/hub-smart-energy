import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useDemoMode } from "@/contexts/DemoMode";

export type AppRole = "admin" | "user" | "super_admin";

interface UserRoleState {
  role: AppRole | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useUserRole(): UserRoleState {
  const { user } = useAuth();
  const isDemo = useDemoMode();

  const { data: role, isLoading } = useQuery<AppRole | null>({
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ensure_at_least_one_admin");
      if (error) {
        console.error("Error resolving user role:", error);
        return "user";
      }
      return (data as AppRole) ?? "user";
    },
    enabled: !!user && !isDemo,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  if (isDemo) return { role: "admin", isAdmin: true, loading: false };

  return {
    role: role ?? null,
    isAdmin: role === "admin",
    loading: isLoading && !!user,
  };
}
