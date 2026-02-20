import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Manages allowed user groups for a charge point group OR an individual charge point.
 * @param type - "group" or "chargepoint"
 * @param entityId - The group or charge point ID
 */
export function useAllowedUserGroups(type: "group" | "chargepoint", entityId: string | null) {
  const qc = useQueryClient();
  const table = type === "group" ? "charge_point_group_allowed_user_groups" : "charge_point_allowed_user_groups";
  const fkCol = type === "group" ? "group_id" : "charge_point_id";
  const queryKey = ["allowed-user-groups", type, entityId];

  const { data: allowedGroupIds = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!entityId) return [];
      const { data, error } = await supabase
        .from(table as any)
        .select("user_group_id")
        .eq(fkCol, entityId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.user_group_id as string);
    },
    enabled: !!entityId,
  });

  const setAllowedGroups = useMutation({
    mutationFn: async (userGroupIds: string[]) => {
      if (!entityId) throw new Error("No entity");
      // Delete existing
      const { error: delErr } = await supabase
        .from(table as any)
        .delete()
        .eq(fkCol, entityId);
      if (delErr) throw delErr;
      // Insert new
      if (userGroupIds.length > 0) {
        const rows = userGroupIds.map((ugId) => ({ [fkCol]: entityId, user_group_id: ugId }));
        const { error: insErr } = await supabase.from(table as any).insert(rows as any);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: "Erlaubte Nutzergruppen gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { allowedGroupIds, isLoading, setAllowedGroups };
}
