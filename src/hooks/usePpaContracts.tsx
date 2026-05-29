import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import type {
  PpaContract,
  PpaOnsiteConfig,
  PpaOffsiteConfig,
  PpaStatus,
  PpaStatusHistoryEntry,
} from "@/lib/ppa/types";

export function usePpaContracts(ppaType?: "onsite" | "offsite") {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["ppa-contracts", tenant?.id, ppaType ?? "all"],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("ppa_contracts" as any)
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false });
      if (ppaType) q = q.eq("ppa_type", ppaType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PpaContract[];
    },
  });
}

export function usePpaContract(id: string | undefined) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["ppa-contract", id],
    enabled: !!tenant?.id && !!id,
    queryFn: async () => {
      const [contractRes, onsiteRes, offsiteRes, consumersRes, historyRes] = await Promise.all([
        supabase.from("ppa_contracts" as any).select("*").eq("id", id!).eq("tenant_id", tenant!.id).maybeSingle(),
        supabase.from("ppa_onsite_config" as any).select("*").eq("contract_id", id!).maybeSingle(),
        supabase.from("ppa_offsite_config" as any).select("*").eq("contract_id", id!).maybeSingle(),
        supabase.from("ppa_consumption_meters" as any).select("meter_id").eq("contract_id", id!),
        supabase
          .from("ppa_status_history" as any)
          .select("*")
          .eq("contract_id", id!)
          .order("changed_at", { ascending: false })
          .limit(50),
      ]);
      if (contractRes.error) throw contractRes.error;
      return {
        contract: contractRes.data as unknown as PpaContract | null,
        onsite: (onsiteRes.data ?? null) as unknown as PpaOnsiteConfig | null,
        offsite: (offsiteRes.data ?? null) as unknown as PpaOffsiteConfig | null,
        consumptionMeterIds: ((consumersRes.data ?? []) as any[]).map((r) => r.meter_id as string),
        history: ((historyRes.data ?? []) as unknown) as PpaStatusHistoryEntry[],
      };
    },
  });
}

export interface CreatePpaInput {
  contract: Omit<PpaContract, "id" | "tenant_id" | "created_at" | "updated_at" | "status"> & {
    status?: PpaStatus;
  };
  onsite?: Omit<PpaOnsiteConfig, "id" | "contract_id" | "tenant_id">;
  offsite?: Omit<PpaOffsiteConfig, "id" | "contract_id" | "tenant_id">;
  consumptionMeterIds?: string[];
}

export function useCreatePpaContract() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePpaInput) => {
      if (!tenant?.id) throw new Error("Kein Mandant");
      const { data: contract, error } = await supabase
        .from("ppa_contracts" as any)
        .insert({ ...input.contract, tenant_id: tenant.id, status: input.contract.status ?? "draft" } as any)
        .select()
        .single();
      if (error) throw error;
      const contractId = (contract as any).id as string;
      if (input.onsite) {
        const { error: e } = await supabase
          .from("ppa_onsite_config" as any)
          .insert({ ...input.onsite, contract_id: contractId, tenant_id: tenant.id } as any);
        if (e) throw e;
      }
      if (input.offsite) {
        const { error: e } = await supabase
          .from("ppa_offsite_config" as any)
          .insert({ ...input.offsite, contract_id: contractId, tenant_id: tenant.id } as any);
        if (e) throw e;
      }
      if (input.consumptionMeterIds && input.consumptionMeterIds.length > 0) {
        const rows = input.consumptionMeterIds.map((meter_id) => ({
          contract_id: contractId,
          meter_id,
          tenant_id: tenant.id,
        }));
        const { error: e } = await supabase.from("ppa_consumption_meters" as any).insert(rows as any);
        if (e) throw e;
      }
      return contract as unknown as PpaContract;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ppa-contracts"] });
    },
  });
}

export function useUpdatePpaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; status: PpaStatus }) => {
      const { error } = await supabase
        .from("ppa_contracts" as any)
        .update({ status: params.status } as any)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ppa-contracts"] });
      qc.invalidateQueries({ queryKey: ["ppa-contract", vars.id] });
    },
  });
}

export function useDeletePpaContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ppa_contracts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ppa-contracts"] }),
  });
}
