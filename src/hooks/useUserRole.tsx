import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useDemoMode } from "@/contexts/DemoMode";
import { getSupportViewTenantId, onSupportViewChanged } from "@/lib/supportView";

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
  const [supportTenantId, setSupportTenantId] = useState<string | null>(() => getSupportViewTenantId());

  useEffect(() => {
    return onSupportViewChanged(() => setSupportTenantId(getSupportViewTenantId()));
  }, []);

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

  // In einer Remote-Support-Sitzung soll der Super-Admin die Tenant-Sicht
  // sehen wie ein Tenant-Admin (inkl. Benutzerverwaltung & Einstellungen).
  const isAdmin = role === "admin" || (role === "super_admin" && !!supportTenantId);

  return {
    role,
    isAdmin,
    loading,
  };
}
