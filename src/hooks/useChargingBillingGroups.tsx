import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTenant } from "@/hooks/useTenant";

export interface ChargingBillingGroup {
  id: string;
  tenant_id: string;
  name: string;
  company_name: string | null;
  billing_email: string | null;
  billing_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  member_count?: number;
}

export interface ChargingBillingGroupMember {
  id: string;
  group_id: string;
  user_id: string;
  tenant_id: string;
  created_at: string;
}

export function useChargingBillingGroups() {
  const qc = useQueryClient();
  const { tenant } = useTenant();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["charging-billing-groups", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_billing_groups" as any)
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;

      const groupList = (data ?? []) as unknown as ChargingBillingGroup[];
      if (groupList.length === 0) return groupList;

      const { data: members } = await supabase
        .from("charging_billing_group_members" as any)
        .select("group_id")
        .in("group_id", groupList.map((g) => g.id));

      const counts = new Map<string, number>();
      for (const m of (members ?? []) as any[]) {
        counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
      }
      return groupList.map((g) => ({ ...g, member_count: counts.get(g.id) ?? 0 }));
    },
  });

  const createGroup = useMutation({
    mutationFn: async (payload: Partial<ChargingBillingGroup>) => {
      if (!tenant?.id) throw new Error("No tenant");
      const { data, error } = await supabase
        .from("charging_billing_groups" as any)
        .insert({ ...payload, tenant_id: tenant.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-billing-groups"] });
      toast({ title: "Rechnungsgruppe erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ChargingBillingGroup> & { id: string }) => {
      const { error } = await supabase
        .from("charging_billing_groups" as any)
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-billing-groups"] });
      toast({ title: "Aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("charging_billing_groups" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-billing-groups"] });
      toast({ title: "Gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { groups, isLoading, createGroup, updateGroup, deleteGroup };
}

export function useChargingBillingGroupMembers(groupId: string | null) {
  const qc = useQueryClient();
  const { tenant } = useTenant();

  const { data: memberUserIds = [], isLoading } = useQuery({
    queryKey: ["charging-billing-group-members", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_billing_group_members" as any)
        .select("user_id")
        .eq("group_id", groupId!);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => r.user_id as string);
    },
  });

  const setMembers = useMutation({
    mutationFn: async (userIds: string[]) => {
      if (!groupId || !tenant?.id) throw new Error("Missing context");
      const current = new Set(memberUserIds);
      const next = new Set(userIds);
      const toAdd = userIds.filter((id) => !current.has(id));
      const toRemove = memberUserIds.filter((id) => !next.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("charging_billing_group_members" as any)
          .insert(
            toAdd.map((user_id) => ({ group_id: groupId, user_id, tenant_id: tenant.id })) as any
          );
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("charging_billing_group_members" as any)
          .delete()
          .eq("group_id", groupId)
          .in("user_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charging-billing-group-members", groupId] });
      qc.invalidateQueries({ queryKey: ["charging-billing-groups"] });
      toast({ title: "Mitglieder aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { memberUserIds, isLoading, setMembers };
}
