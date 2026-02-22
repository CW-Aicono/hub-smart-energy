import { useEffect, useState } from "react";
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
  const [role, setRole] = useState<AppRole | null>(isDemo ? "admin" : null);
  const [loading, setLoading] = useState(!isDemo);

  useEffect(() => {
    if (isDemo) return;

    let cancelled = false;

    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const resolveRole = async () => {
      setLoading(true);

      const { data, error } = await supabase.rpc("ensure_at_least_one_admin");

      if (cancelled) return;

      if (error) {
        console.error("Error resolving user role:", error);
        setRole("user");
      } else {
        setRole((data as AppRole) ?? "user");
      }

      setLoading(false);
    };

    resolveRole();

    return () => {
      cancelled = true;
    };
  }, [user, isDemo]);

  return {
    role,
    isAdmin: role === "admin",
    loading,
  };
}
