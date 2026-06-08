import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getT } from "@/i18n/getT";
import { writeAuditLog } from "@/lib/auditLog";

export type TenantLifecycleStatus = "active" | "suspended" | "deleted";

export function useTenants() {
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["super-admin-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createTenant = useMutation({
    mutationFn: async (values: { name: string; slug: string; contact_email?: string }) => {
      const { data, error } = await supabase
        .from("tenants")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      const t = getT();
      toast({ title: t("tenant.created") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  const deleteTenant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      const t = getT();
      toast({ title: t("tenant.deleted") });
    },
    onError: (e: Error) => {
      const t = getT();
      toast({ title: t("common.error"), description: e.message, variant: "destructive" });
    },
  });

  // A2: Lifecycle transitions
  const suspendTenant = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase
        .from("tenants")
        .update({ status: "suspended", suspended_reason: reason || null } as any)
        .eq("id", id);
      if (error) throw error;
      return { id, reason };
    },
    onSuccess: ({ id, reason }) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      toast({ title: "Mandant gesperrt" });
      writeAuditLog({
        action: "tenant.status_change",
        entity_type: "tenant",
        entity_id: id,
        tenant_id: id,
        before: { status: "active" },
        after: { status: "suspended" },
        metadata: reason ? { reason } : undefined,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const reactivateTenant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tenants")
        .update({ status: "active" } as any)
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      toast({ title: "Mandant reaktiviert" });
      writeAuditLog({
        action: "tenant.status_change",
        entity_type: "tenant",
        entity_id: id,
        tenant_id: id,
        before: { status: "suspended" },
        after: { status: "active" },
      });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const softDeleteTenant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tenants")
        .update({ status: "deleted" } as any)
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-tenants"] });
      toast({ title: "Mandant in Papierkorb verschoben" });
      writeAuditLog({
        action: "tenant.delete",
        entity_type: "tenant",
        entity_id: id,
        tenant_id: id,
        after: { status: "deleted" },
      });
    },
    onError: (e: Error) =>
      toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  return {
    tenants,
    isLoading,
    createTenant,
    deleteTenant,
    suspendTenant,
    reactivateTenant,
    softDeleteTenant,
  };
}
