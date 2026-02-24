import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ModuleBundle {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModuleBundleItem {
  id: string;
  bundle_id: string;
  module_code: string;
  created_at: string;
}

export function useModuleBundles() {
  const queryClient = useQueryClient();

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ["module-bundles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("module_bundles")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ModuleBundle[];
    },
  });

  const { data: bundleItems = [] } = useQuery({
    queryKey: ["module-bundle-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("module_bundle_items")
        .select("*");
      if (error) throw error;
      return data as ModuleBundleItem[];
    },
  });

  const createBundle = useMutation({
    mutationFn: async (params: { name: string; description?: string; price_monthly: number; module_codes: string[] }) => {
      const { data, error } = await supabase
        .from("module_bundles")
        .insert({ name: params.name, description: params.description || null, price_monthly: params.price_monthly })
        .select()
        .single();
      if (error) throw error;

      if (params.module_codes.length > 0) {
        const items = params.module_codes.map((code) => ({ bundle_id: data.id, module_code: code }));
        const { error: itemErr } = await supabase.from("module_bundle_items").insert(items);
        if (itemErr) throw itemErr;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-bundles"] });
      queryClient.invalidateQueries({ queryKey: ["module-bundle-items"] });
      toast({ title: "Bundle erstellt" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const updateBundle = useMutation({
    mutationFn: async (params: { id: string; name: string; description?: string; price_monthly: number; module_codes: string[] }) => {
      const { error } = await supabase
        .from("module_bundles")
        .update({ name: params.name, description: params.description || null, price_monthly: params.price_monthly })
        .eq("id", params.id);
      if (error) throw error;

      // Replace items
      const { error: delErr } = await supabase.from("module_bundle_items").delete().eq("bundle_id", params.id);
      if (delErr) throw delErr;

      if (params.module_codes.length > 0) {
        const items = params.module_codes.map((code) => ({ bundle_id: params.id, module_code: code }));
        const { error: insErr } = await supabase.from("module_bundle_items").insert(items);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-bundles"] });
      queryClient.invalidateQueries({ queryKey: ["module-bundle-items"] });
      toast({ title: "Bundle aktualisiert" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const deleteBundle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("module_bundles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-bundles"] });
      queryClient.invalidateQueries({ queryKey: ["module-bundle-items"] });
      toast({ title: "Bundle gelöscht" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const getBundleModules = (bundleId: string) => bundleItems.filter((i) => i.bundle_id === bundleId);

  return { bundles, isLoading, bundleItems, createBundle, updateBundle, deleteBundle, getBundleModules };
}
