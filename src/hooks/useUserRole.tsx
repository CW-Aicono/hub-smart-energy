import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "user";

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
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching role:", error);
        setRole("user");
      } else {
        setRole((data?.role as AppRole) ?? "user");
      }
      setLoading(false);
    };

    fetchRole();
  }, [user]);

  return {
    role,
    isAdmin: role === "admin",
    loading,
  };
}
