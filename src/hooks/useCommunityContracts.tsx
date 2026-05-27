import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { toast } from "./use-toast";

export interface ContractTemplate {
  id: string;
  tenant_id: string;
  community_id: string | null;
  name: string;
  version: number;
  body_markdown: string;
  placeholders: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberSignature {
  id: string;
  tenant_id: string;
  community_id: string;
  member_id: string;
  template_id: string;
  template_version: number;
  signer_name: string;
  signer_ip: string | null;
  user_agent: string | null;
  body_hash: string;
  signed_body: string;
  signed_at: string;
  created_at: string;
}

/** Replace {{key}} placeholders from a flat record. */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useContractTemplates(communityId: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["contract-templates", tenantId, communityId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("community_contract_templates")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("updated_at", { ascending: false });
      if (communityId) {
        q = q.or(`community_id.is.null,community_id.eq.${communityId}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ContractTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (values: {
      name: string;
      body_markdown: string;
      placeholders?: string[];
      community_id?: string | null;
    }) => {
      const { error } = await supabase.from("community_contract_templates").insert({
        tenant_id: tenantId!,
        community_id: values.community_id ?? null,
        name: values.name,
        body_markdown: values.body_markdown,
        placeholders: values.placeholders ?? [],
        version: 1,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates", tenantId] });
      toast({ title: "Vertragsschablone gespeichert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, bumpVersion, ...values }: { id: string; bumpVersion?: boolean } & Partial<ContractTemplate>) => {
      const patch: Record<string, unknown> = { ...values };
      if (bumpVersion) {
        const current = templates.find((t) => t.id === id);
        patch.version = (current?.version ?? 1) + 1;
      }
      const { error } = await supabase.from("community_contract_templates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates", tenantId] });
      toast({ title: "Schablone aktualisiert" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_contract_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-templates", tenantId] });
      toast({ title: "Schablone gelöscht" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { templates, isLoading, createTemplate, updateTemplate, deleteTemplate };
}

export function useMemberSignatures(communityId: string | null) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const tenantId = tenant?.id;

  const { data: signatures = [], isLoading } = useQuery({
    queryKey: ["member-signatures", tenantId, communityId],
    enabled: !!tenantId && !!communityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_member_signatures")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("community_id", communityId!)
        .order("signed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MemberSignature[];
    },
  });

  const signContract = useMutation({
    mutationFn: async (values: {
      memberId: string;
      template: ContractTemplate;
      signerName: string;
      renderedBody: string;
    }) => {
      const body_hash = await sha256Hex(values.renderedBody);
      let signer_ip: string | null = null;
      try {
        const r = await fetch("https://api.ipify.org?format=json");
        const j = await r.json();
        signer_ip = j.ip ?? null;
      } catch {
        signer_ip = null;
      }
      const { error } = await supabase.from("community_member_signatures").insert({
        tenant_id: tenantId!,
        community_id: communityId!,
        member_id: values.memberId,
        template_id: values.template.id,
        template_version: values.template.version,
        signer_name: values.signerName,
        signer_ip,
        user_agent: navigator.userAgent,
        body_hash,
        signed_body: values.renderedBody,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member-signatures", tenantId, communityId] });
      toast({ title: "Vertrag digital unterzeichnet" });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return { signatures, isLoading, signContract };
}
