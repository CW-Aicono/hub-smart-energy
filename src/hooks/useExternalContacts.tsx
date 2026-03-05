import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "@/hooks/use-toast";

export interface ExternalContact {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateContactInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

export const useExternalContacts = () => {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["external-contacts", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_contacts")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;
      return data as ExternalContact[];
    },
  });

  const createContact = useMutation({
    mutationFn: async (input: CreateContactInput) => {
      const { data, error } = await supabase
        .from("external_contacts")
        .insert({
          tenant_id: tenant!.id,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          company: input.company ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ExternalContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-contacts", tenant?.id] });
      toast({ title: "Kontakt erstellt" });
    },
    onError: () => {
      toast({ title: "Fehler beim Erstellen", variant: "destructive" });
    },
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExternalContact> & { id: string }) => {
      const { error } = await supabase
        .from("external_contacts")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-contacts", tenant?.id] });
      toast({ title: "Kontakt aktualisiert" });
    },
    onError: () => {
      toast({ title: "Fehler beim Aktualisieren", variant: "destructive" });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("external_contacts")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-contacts", tenant?.id] });
      toast({ title: "Kontakt gelöscht" });
    },
    onError: () => {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    },
  });

  /** Find contacts matching name, email, or phone (for auto-suggest) */
  const findMatches = (query: string): ExternalContact[] => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.company?.toLowerCase().includes(q)
    );
  };

  return { contacts, isLoading, createContact, updateContact, deleteContact, findMatches };
};
