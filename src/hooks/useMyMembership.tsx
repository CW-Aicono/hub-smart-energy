import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Resolves the current authenticated user to their community_members row(s)
 * via email match. Returns the first active membership (status != 'left').
 * Stage 3 scaffold — Stage 4 will broaden this to multi-community support.
 */
export function useMyMembership() {
  const { user } = useAuth();
  const email = user?.email ?? null;

  return useQuery({
    queryKey: ["my-membership", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_members")
        .select("id, community_id, display_name, email, status, role, share_kw, malo_id, melo_id, member_no")
        .eq("email", email!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const active = (data ?? []).find((m) => m.status !== "left") ?? null;
      return { all: data ?? [], active };
    },
  });
}
