import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ChargingUserGroup {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChargingUser {
  id: string;
  tenant_id: string;
  group_id: string | null;
  name: string;
  email: string | null;
  rfid_tag: string | null;
  phone: string | null;
  status: "active" | "blocked" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useChargingUserGroups() {
  const qc = useQueryClient();
  const key = ["charging-user-groups"];

  const { data: groups = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_user_groups")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ChargingUserGroup[];
    },
  });

  const addGroup = useMutation({
    mutationFn: async (g: { tenant_id: string; name: string; description?: string }) => {
      const { error } = await supabase.from("charging_user_groups").insert(g);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Gruppe erstellt"); },
    onError: () => toast.error("Fehler beim Erstellen"),
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, ...rest }: { id: string; name?: string; description?: string }) => {
      const { error } = await supabase.from("charging_user_groups").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Gruppe aktualisiert"); },
    onError: () => toast.error("Fehler beim Aktualisieren"),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("charging_user_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Gruppe gelöscht"); },
    onError: () => toast.error("Fehler beim Löschen"),
  });

  return { groups, isLoading, addGroup, updateGroup, deleteGroup };
}

export function useChargingUsers() {
  const qc = useQueryClient();
  const key = ["charging-users"];

  const { data: users = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charging_users")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ChargingUser[];
    },
  });

  const addUser = useMutation({
    mutationFn: async (u: {
      tenant_id: string;
      name: string;
      email?: string;
      rfid_tag?: string;
      phone?: string;
      group_id?: string | null;
      notes?: string;
    }) => {
      const { error } = await supabase.from("charging_users").insert(u);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Nutzer erstellt"); },
    onError: () => toast.error("Fehler beim Erstellen"),
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, ...rest }: {
      id: string;
      name?: string;
      email?: string;
      rfid_tag?: string;
      phone?: string;
      group_id?: string | null;
      status?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("charging_users").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Nutzer aktualisiert"); },
    onError: () => toast.error("Fehler beim Aktualisieren"),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("charging_users").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Nutzer gelöscht"); },
    onError: () => toast.error("Fehler beim Löschen"),
  });

  return { users, isLoading, addUser, updateUser, deleteUser };
}
