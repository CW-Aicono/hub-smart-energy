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

    const check = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "super_admin",
      });

      if (!cancelled) {
        setIsSuperAdmin(!error && data === true);
        setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [user]);

  return { isSuperAdmin, loading };
}
