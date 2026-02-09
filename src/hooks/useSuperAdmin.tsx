import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface SuperAdminState {
  isSuperAdmin: boolean;
  loading: boolean;
}

export function useSuperAdmin(): SuperAdminState {
  const { user } = useAuth();

  // TEST-ONLY: Skip DB check, grant super_admin to any logged-in user
  return {
    isSuperAdmin: !!user,
    loading: false,
  };
}
