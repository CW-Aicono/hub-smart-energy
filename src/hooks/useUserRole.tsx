import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "user" | "super_admin";

interface UserRoleState {
  role: AppRole | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useUserRole(): UserRoleState {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const resolveRole = async () => {
      setLoading(true);

      // Ensures the first user becomes admin if no admin exists.
      // Also inserts a default role row for users missing one.
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
  }, [user]);

  return {
    role,
    isAdmin: role === "admin",
    loading,
  };
}

