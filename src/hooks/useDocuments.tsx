import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";
import { downloadSecureStorageObject } from "@/lib/secureStorage";

export type DocumentScope =
  | "tenant"
  | "location"
  | "meter"
  | "charge_point"
  | "gateway_device"
  | "energy_storage"
  | "energy_supplier_invoice";

export interface DocumentCategory {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_system: boolean;
}

export interface DocumentLink {
  id: string;
  document_id: string;
  scope: DocumentScope;
  scope_id: string | null;
  location_id: string | null;
}

export interface DocumentRow {
  id: string;
  tenant_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  tags: string[];
  valid_from: string | null;
  valid_until: string | null;
  current_version_id: string | null;
  latest_version_no: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: DocumentCategory | null;
  current_version?: DocumentVersion | null;
  links?: DocumentLink[];
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_no: number;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  file_hash: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const MAX_BYTES = 25 * 1024 * 1024;

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function useDocumentCategories() {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["document-categories", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_categories")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as DocumentCategory[];
    },
  });
}

interface UseDocumentsParams {
  scope?: DocumentScope;
  scopeId?: string | null;
  categoryId?: string | null;
  search?: string;
}

export function useDocuments(params: UseDocumentsParams = {}) {
  const { tenant } = useTenant();
  const { scope, scopeId, categoryId, search } = params;
  return useQuery({
    queryKey: ["documents", tenant?.id, scope ?? null, scopeId ?? null, categoryId ?? null, search ?? ""],
    enabled: !!tenant?.id,
    queryFn: async () => {
      let query = supabase
        .from("documents")
        .select(
          `*, category:document_categories(*), current_version:document_versions!documents_current_version_fk(*), links:document_links(*)`,
        )
        .eq("tenant_id", tenant!.id)
        .order("updated_at", { ascending: false });

      if (categoryId) query = query.eq("category_id", categoryId);
      if (search && search.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(`title.ilike.${q},description.ilike.${q}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      let rows = (data ?? []) as unknown as DocumentRow[];

      if (scope) {
        rows = rows.filter((r) =>
          (r.links ?? []).some(
            (l) => l.scope === scope && (scope === "tenant" ? l.scope_id === null : l.scope_id === scopeId),
          ),
        );
      }
      return rows;
    },
  });
}

/** Lightweight: only the count of docs the user can see for a given scope target. */
export function useDocumentsForScope(scope: DocumentScope, scopeId: string | null | undefined) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["documents-scope", tenant?.id, scope, scopeId ?? null],
    enabled: !!tenant?.id && (scope === "tenant" || !!scopeId),
    queryFn: async () => {
      let query = supabase
        .from("document_links")
        .select(`document_id, documents:document_id(*, category:document_categories(*), current_version:document_versions!documents_current_version_fk(*))`)
        .eq("tenant_id", tenant!.id)
        .eq("scope", scope);
      if (scope === "tenant") query = query.is("scope_id", null);
      else query = query.eq("scope_id", scopeId!);

      const { data, error } = await query;
      if (error) throw error;
      // Filter out rows where documents is null (RLS hid the doc)
      return (data ?? [])
        .map((r: any) => r.documents as DocumentRow | null)
        .filter((d): d is DocumentRow => !!d);
    },
  });
}

export function useUploadDocument() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      title: string;
      description?: string;
      tags?: string[];
      categoryId?: string | null;
      validFrom?: string | null;
      validUntil?: string | null;
      links: Array<{ scope: DocumentScope; scope_id: string | null; location_id?: string | null }>;
    }) => {
      if (!tenant?.id || !user) throw new Error("Nicht angemeldet");
      if (params.file.size > MAX_BYTES) throw new Error("Datei zu groß (max. 25 MB)");
      const mime = params.file.type || "application/octet-stream";
      if (!ALLOWED_MIME.has(mime)) throw new Error(`Dateityp nicht erlaubt: ${mime}`);
      if (!params.links.length) throw new Error("Bitte mindestens eine Verknüpfung wählen");

      // 1. Insert document row
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          tenant_id: tenant.id,
          category_id: params.categoryId ?? null,
          title: params.title,
          description: params.description ?? null,
          tags: params.tags ?? [],
          valid_from: params.validFrom ?? null,
          valid_until: params.validUntil ?? null,
          created_by: user.id,
          updated_by: user.id,
        })
        .select("id")
        .single();
      if (docErr) throw docErr;

      const versionNo = 1;
      const safeName = params.file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${tenant.id}/${doc.id}/${versionNo}_${safeName}`;

      // 2. Upload
      const { error: upErr } = await supabase.storage.from("tenant-documents").upload(path, params.file, {
        contentType: mime,
        upsert: false,
      });
      if (upErr) {
        await supabase.from("documents").delete().eq("id", doc.id);
        throw upErr;
      }

      const hash = await sha256(params.file);

      // 3. Insert version
      const { error: verErr } = await supabase.from("document_versions").insert({
        document_id: doc.id,
        version_no: versionNo,
        filename: params.file.name,
        storage_path: path,
        mime_type: mime,
        file_size_bytes: params.file.size,
        file_hash: hash,
        uploaded_by: user.id,
      });
      if (verErr) throw verErr;

      // 4. Insert links
      const linkRows = params.links.map((l) => ({
        document_id: doc.id,
        tenant_id: tenant.id,
        scope: l.scope,
        scope_id: l.scope === "tenant" ? null : l.scope_id,
        location_id: l.location_id ?? null,
      }));
      const { error: linkErr } = await supabase.from("document_links").insert(linkRows);
      if (linkErr) throw linkErr;

      return doc.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["documents-scope"] });
      toast({ title: "Dokument hochgeladen" });
    },
    onError: (e: Error) => toast({ title: "Upload fehlgeschlagen", description: e.message, variant: "destructive" }),
  });
}

export function useAddDocumentVersion() {
  const { tenant } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { documentId: string; file: File; notes?: string }) => {
      if (!tenant?.id || !user) throw new Error("Nicht angemeldet");
      if (params.file.size > MAX_BYTES) throw new Error("Datei zu groß (max. 25 MB)");
      const mime = params.file.type || "application/octet-stream";
      if (!ALLOWED_MIME.has(mime)) throw new Error(`Dateityp nicht erlaubt: ${mime}`);

      const { data: doc } = await supabase
        .from("documents")
        .select("latest_version_no")
        .eq("id", params.documentId)
        .single();
      const versionNo = (doc?.latest_version_no ?? 0) + 1;
      const safeName = params.file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${tenant.id}/${params.documentId}/${versionNo}_${safeName}`;

      const { error: upErr } = await supabase.storage.from("tenant-documents").upload(path, params.file, {
        contentType: mime,
        upsert: false,
      });
      if (upErr) throw upErr;

      const hash = await sha256(params.file);
      const { error: verErr } = await supabase.from("document_versions").insert({
        document_id: params.documentId,
        version_no: versionNo,
        filename: params.file.name,
        storage_path: path,
        mime_type: mime,
        file_size_bytes: params.file.size,
        file_hash: hash,
        notes: params.notes ?? null,
        uploaded_by: user.id,
      });
      if (verErr) throw verErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["document-versions"] });
      qc.invalidateQueries({ queryKey: ["documents-scope"] });
      toast({ title: "Neue Version gespeichert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useDocumentVersions(documentId: string | null) {
  return useQuery({
    queryKey: ["document-versions", documentId],
    enabled: !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_versions")
        .select("*")
        .eq("document_id", documentId!)
        .order("version_no", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentVersion[];
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      // Storage cleanup: list all versions, delete files
      const { data: versions } = await supabase
        .from("document_versions")
        .select("storage_path")
        .eq("document_id", documentId);
      if (versions?.length) {
        const paths = versions.map((v) => v.storage_path).filter(Boolean);
        if (paths.length) await supabase.storage.from("tenant-documents").remove(paths);
      }
      const { error } = await supabase.from("documents").delete().eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["documents-scope"] });
      toast({ title: "Dokument gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Löschen fehlgeschlagen", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateDocumentLinks() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      documentId: string;
      links: Array<{ scope: DocumentScope; scope_id: string | null; location_id?: string | null }>;
    }) => {
      if (!tenant?.id) throw new Error("Kein Tenant");
      await supabase.from("document_links").delete().eq("document_id", params.documentId);
      if (params.links.length) {
        const rows = params.links.map((l) => ({
          document_id: params.documentId,
          tenant_id: tenant.id,
          scope: l.scope,
          scope_id: l.scope === "tenant" ? null : l.scope_id,
          location_id: l.location_id ?? null,
        }));
        const { error } = await supabase.from("document_links").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["documents-scope"] });
      toast({ title: "Verknüpfungen aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export async function downloadDocumentVersion(version: DocumentVersion): Promise<void> {
  const url = await downloadSecureStorageObject("tenant-documents", version.storage_path);
  if (!url) {
    toast({ title: "Download fehlgeschlagen", variant: "destructive" });
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = version.filename;
  a.click();
}
