import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { downloadSecureStorageObject } from "@/lib/secureStorage";
import type { PpaDocument } from "@/lib/ppa/types";

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function usePpaDocuments(contractId: string | undefined) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["ppa-documents", contractId],
    enabled: !!tenant?.id && !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ppa_documents" as any)
        .select("*")
        .eq("contract_id", contractId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PpaDocument[];
    },
  });
}

export function useUploadPpaDocument() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      contractId: string;
      file: File;
      docType: PpaDocument["doc_type"];
      validFrom?: string | null;
      validUntil?: string | null;
    }) => {
      if (!tenant?.id) throw new Error("Kein Mandant");
      const hash = await sha256(params.file);
      const safeName = params.file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${tenant.id}/${params.contractId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("ppa-documents").upload(path, params.file, {
        contentType: params.file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("ppa_documents" as any).insert({
        contract_id: params.contractId,
        tenant_id: tenant.id,
        doc_type: params.docType,
        filename: params.file.name,
        storage_path: path,
        file_hash: hash,
        file_size_bytes: params.file.size,
        mime_type: params.file.type || null,
        valid_from: params.validFrom ?? null,
        valid_until: params.validUntil ?? null,
      } as any);
      if (insErr) throw insErr;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["ppa-documents", vars.contractId] }),
  });
}

export function useDownloadPpaDocument() {
  return useMutation({
    mutationFn: async (doc: PpaDocument) => {
      const url = await downloadSecureStorageObject("ppa-documents", doc.storage_path);
      if (!url) throw new Error("Download fehlgeschlagen");
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      a.click();
    },
  });
}
