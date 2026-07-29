import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "./useTenantQuery";
import { toast } from "sonner";

export interface WorkspaceShare {
  workspace_id: string;
  user_id: string;
  can_edit: boolean;
  created_at: string;
  email?: string;
  full_name?: string;
}

export function useWorkspaceShares(workspaceId: string | null) {
  const qc = useQueryClient();

  const { data: shares = [], isLoading } = useQuery({
    queryKey: ["workspace-shares", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analysis_workspace_shares" as any)
        .select("*")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      const rows = (data ?? []) as unknown as WorkspaceShare[];
      if (rows.length === 0) return rows;
      const userIds = rows.map((r) => r.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        email: map.get(r.user_id)?.email,
        full_name: map.get(r.user_id)?.full_name,
      }));
    },
  });

  const addShare = useMutation({
    mutationFn: async ({ userId, canEdit }: { userId: string; canEdit: boolean }) => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await supabase
        .from("analysis_workspace_shares" as any)
        .upsert({ workspace_id: workspaceId, user_id: userId, can_edit: canEdit });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-shares", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeShare = useMutation({
    mutationFn: async (userId: string) => {
      if (!workspaceId) throw new Error("No workspace");
      const { error } = await supabase
        .from("analysis_workspace_shares" as any)
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-shares", workspaceId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    shares,
    isLoading,
    addShare: addShare.mutateAsync,
    removeShare: removeShare.mutateAsync,
  };
}

export function useTenantUsers() {
  const { tenantId, ready } = useTenantQuery();
  return useQuery({
    queryKey: ["tenant-users-for-sharing", tenantId],
    enabled: ready && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as { id: string; email: string | null; full_name: string | null }[];
    },
  });
}
