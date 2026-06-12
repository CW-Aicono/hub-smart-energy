import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getT } from "@/i18n/getT";
import { useTenant } from "@/hooks/useTenant";

export interface ChargingUserGroup {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_app_user: boolean;
  tariff_id: string | null;
  status: "active" | "blocked" | "archived";
  created_at: string;
  updated_at: string;
}

export interface ChargingUserTag {
  id: string;
  tenant_id: string;
  user_id: string;
  tag: string;
  label: string | null;
  created_at: string;
}

export interface ChargingUser {
  id: string;
  tenant_id: string;
  group_id: string | null;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  rfid_tag: string | null;
  rfid_label: string | null;
  phone: string | null;
  status: "active" | "blocked" | "archived";
  notes: string | null;
  tariff_id: string | null;
  created_at: string;
  updated_at: string;
  /** Alle RFID-Tags des Nutzers (inkl. Legacy rfid_tag/rfid_label, dedupliziert). */
  tags: ChargingUserTag[];
}



export function useChargingUserGroups() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  const key = ["charging-user-groups", tenant?.id];

  const { data: groups = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_user_groups")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;
      return data as ChargingUserGroup[];
    },
  });

  const addGroup = useMutation({
    mutationFn: async (g: { tenant_id: string; name: string; description?: string; tariff_id?: string | null; is_app_user?: boolean; status?: string }) => {
      const { error } = await supabase.from("charging_user_groups").insert(g);
      if (error) throw error;
    },
    onSuccess: () => { const t = getT(); qc.invalidateQueries({ queryKey: key }); toast.success(t("chargingUser.groupCreated")); },
    onError: () => { const t = getT(); toast.error(t("common.errorCreate")); },
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, ...rest }: { id: string; name?: string; description?: string; tariff_id?: string | null; is_app_user?: boolean; status?: string }) => {
      const { error } = await supabase.from("charging_user_groups").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { const t = getT(); qc.invalidateQueries({ queryKey: key }); toast.success(t("chargingUser.groupUpdated")); },
    onError: () => { const t = getT(); toast.error(t("common.errorUpdate")); },
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("charging_user_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { const t = getT(); qc.invalidateQueries({ queryKey: key }); toast.success(t("chargingUser.groupDeleted")); },
    onError: () => { const t = getT(); toast.error(t("common.errorDelete")); },
  });

  return { groups, isLoading, addGroup, updateGroup, deleteGroup };
}

export function useChargingUsers() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  const key = ["charging-users", tenant?.id];

  const { data: users = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: key,
    enabled: !!tenant?.id,
    queryFn: async () => {
      const [{ data: rows, error }, { data: tagRows, error: tagErr }] = await Promise.all([
        supabase
          .from("charging_users")
          .select("*")
          .eq("tenant_id", tenant!.id)
          .order("name"),
        supabase
          .from("charging_user_rfid_tags")
          .select("id, tenant_id, user_id, tag, label, created_at")
          .eq("tenant_id", tenant!.id)
          .order("created_at"),
      ]);
      if (error) throw error;
      if (tagErr) throw tagErr;
      const tagsByUser = new Map<string, ChargingUserTag[]>();
      for (const t of (tagRows ?? []) as ChargingUserTag[]) {
        const arr = tagsByUser.get(t.user_id) ?? [];
        arr.push(t);
        tagsByUser.set(t.user_id, arr);
      }
      return (rows ?? []).map((r: any) => ({ ...r, tags: tagsByUser.get(r.id) ?? [] })) as ChargingUser[];
    },
  });


  const addUser = useMutation({
    mutationFn: async (u: {
      tenant_id: string;
      name: string;
      email?: string;
      rfid_tag?: string;
      rfid_label?: string;
      phone?: string;
      group_id?: string | null;
      tariff_id?: string | null;
      notes?: string;
    }): Promise<string> => {
      const { data, error } = await supabase.from("charging_users").insert(u).select("id").single();
      if (error) throw error;
      return data!.id as string;
    },
    onSuccess: () => { const t = getT(); qc.invalidateQueries({ queryKey: key }); toast.success(t("chargingUser.created")); },
    onError: () => { const t = getT(); toast.error(t("common.errorCreate")); },
  });


  const updateUser = useMutation({
    mutationFn: async ({ id, ...rest }: {
      id: string;
      name?: string;
      email?: string;
      rfid_tag?: string;
      rfid_label?: string;
      phone?: string;
      group_id?: string | null;
      tariff_id?: string | null;
      status?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("charging_users").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { const t = getT(); qc.invalidateQueries({ queryKey: key }); toast.success(t("chargingUser.updated")); },
    onError: () => { const t = getT(); toast.error(t("common.errorUpdate")); },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("charging_users").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { const t = getT(); qc.invalidateQueries({ queryKey: key }); toast.success(t("chargingUser.deleted")); },
    onError: () => { const t = getT(); toast.error(t("common.errorDelete")); },
  });

  /**
   * Ersetzt die komplette Tag-Liste eines Nutzers (atomar: löschen + neu einfügen).
   * Tags werden case-insensitiv eindeutig gehalten (UPPER + Trim).
   * Schreibt zusätzlich den ersten Tag in die Legacy-Spalten rfid_tag/rfid_label,
   * damit Backwards-Kompat erhalten bleibt.
   */
  const setUserTags = useMutation({
    mutationFn: async (args: { tenant_id: string; user_id: string; tags: { tag: string; label: string | null }[] }) => {
      const seen = new Set<string>();
      const clean = args.tags
        .map((t) => ({ tag: (t.tag ?? "").replace(/\s+/g, "").trim().toUpperCase(), label: (t.label ?? "").trim() || null }))
        .filter((t) => {
          if (!t.tag) return false;
          if (seen.has(t.tag)) return false;
          seen.add(t.tag);
          return true;
        });

      const { error: delErr } = await supabase
        .from("charging_user_rfid_tags")
        .delete()
        .eq("user_id", args.user_id);
      if (delErr) throw delErr;

      if (clean.length > 0) {
        const { error: insErr } = await supabase
          .from("charging_user_rfid_tags")
          .insert(clean.map((t) => ({ tenant_id: args.tenant_id, user_id: args.user_id, tag: t.tag, label: t.label })));
        if (insErr) throw insErr;
      }

      // Legacy-Spiegel: ersten Tag in charging_users zurückschreiben
      const primary = clean[0] ?? null;
      const { error: updErr } = await supabase
        .from("charging_users")
        .update({
          rfid_tag: primary?.tag ?? null,
          rfid_label: primary?.label ?? null,
        })
        .eq("id", args.user_id);
      if (updErr) throw updErr;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); },
    onError: () => { const t = getT(); toast.error(t("common.errorUpdate")); },
  });

  return { users, isLoading, isError, error, refetch, addUser, updateUser, deleteUser, setUserTags };
}

