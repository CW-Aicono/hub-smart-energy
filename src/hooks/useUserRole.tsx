import { useEffect, useState } from "react";
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
    let cancelled = false;

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

      if (cancelled) return;

      // If the user has no role row yet, bootstrap one (and guarantee at least one admin exists).
      if (!error && !data?.role) {
        const { data: bootstrappedRole, error: bootstrapError } =
          await supabase.rpc("bootstrap_user_role");

        if (!cancelled) {
          if (bootstrapError) {
            console.error("Error bootstrapping role:", bootstrapError);
            setRole("user");
          } else {
            setRole((bootstrappedRole as AppRole) ?? "user");
          }
          setLoading(false);
        }
        return;
      }

      if (error) {
        console.error("Error fetching role:", error);
        setRole("user");
      } else {
        setRole((data?.role as AppRole) ?? "user");
      }

      setLoading(false);
    };

    fetchRole();

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

