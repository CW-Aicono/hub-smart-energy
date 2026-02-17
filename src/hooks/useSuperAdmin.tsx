import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface SuperAdminState {
  isSuperAdmin: boolean;
  loading: boolean;
}

export function useSuperAdmin(): SuperAdminState {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    const checkRole = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Error checking super_admin role:", error);
        setIsSuperAdmin(false);
      } else {
        setIsSuperAdmin(!!data);
      }
      setLoading(false);
    };

    checkRole();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { isSuperAdmin, loading };
}
