import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface PpaGooCertificate {
  id: string;
  tenant_id: string;
  contract_id: string;
  certificate_number: string;
  registry: string;
  energy_source: string;
  generation_period_start: string;
  generation_period_end: string;
  volume_kwh: number;
  status: "issued" | "transferred" | "redeemed" | "cancelled";
  counterparty: string | null;
  issued_at: string | null;
  transferred_at: string | null;
  redeemed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function usePpaGooCertificates(contractId: string | undefined) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["ppa-goo", contractId],
    enabled: !!tenant?.id && !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ppa_goo_certificates" as any)
        .select("*")
        .eq("contract_id", contractId!)
        .eq("tenant_id", tenant!.id)
        .order("generation_period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PpaGooCertificate[];
    },
  });
}

export function useCreatePpaGooCertificate() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<PpaGooCertificate, "id" | "tenant_id" | "created_at" | "updated_at">) => {
      if (!tenant?.id) throw new Error("Kein Mandant");
      const { data, error } = await supabase
        .from("ppa_goo_certificates" as any)
        .insert({ ...input, tenant_id: tenant.id, issued_at: input.issued_at ?? new Date().toISOString() } as any)
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["ppa-goo", vars.contract_id] }),
  });
}

export function useUpdatePpaGooStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; contract_id: string; status: PpaGooCertificate["status"]; counterparty?: string | null }) => {
      const patch: any = { status: params.status };
      if (params.status === "transferred") patch.transferred_at = new Date().toISOString();
      if (params.status === "redeemed") patch.redeemed_at = new Date().toISOString();
      if (params.counterparty !== undefined) patch.counterparty = params.counterparty;
      const { error } = await supabase.from("ppa_goo_certificates" as any).update(patch).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["ppa-goo", vars.contract_id] }),
  });
}

export function useDeletePpaGooCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; contract_id: string }) => {
      const { error } = await supabase.from("ppa_goo_certificates" as any).delete().eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["ppa-goo", vars.contract_id] }),
  });
}

export function useGeneratePpaReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { contract_id: string; settlement_id?: string; period_start?: string }) => {
      const { data, error } = await supabase.functions.invoke("ppa-report-generate", { body: params });
      if (error) throw error;
      return data as { document_id: string; filename: string; storage_path: string };
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["ppa-documents", vars.contract_id] }),
  });
}
