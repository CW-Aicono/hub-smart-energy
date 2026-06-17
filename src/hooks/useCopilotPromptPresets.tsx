import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PromptPreset {
  id: string;
  tenant_id: string;
  label: string;
  prompt: string;
  sort_order: number;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertPresetArgs {
  id?: string;
  label: string;
  prompt: string;
  sort_order?: number;
}

export function useCopilotPromptPresets() {
  return useQuery({
    queryKey: ["copilot-prompt-presets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_prompt_presets" as any)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PromptPreset[];
    },
  });
}

export function useUpsertPromptPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: UpsertPresetArgs) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Nicht angemeldet");
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", userId)
        .single();
      if (!profile?.tenant_id) throw new Error("Kein Mandant zugeordnet");

      if (args.id) {
        const { error } = await supabase
          .from("copilot_prompt_presets" as any)
          .update({
            label: args.label,
            prompt: args.prompt,
            ...(args.sort_order !== undefined ? { sort_order: args.sort_order } : {}),
          })
          .eq("id", args.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("copilot_prompt_presets" as any).insert({
          tenant_id: profile.tenant_id,
          created_by: userId,
          label: args.label,
          prompt: args.prompt,
          sort_order: args.sort_order ?? 100,
          is_default: false,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["copilot-prompt-presets"] });
      toast.success(args.id ? "Vorschlag aktualisiert" : "Vorschlag hinzugefügt");
    },
    onError: (e: any) => toast.error(e?.message ?? "Speichern fehlgeschlagen"),
  });
}

export function useDeletePromptPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("copilot_prompt_presets" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["copilot-prompt-presets"] });
      toast.success("Vorschlag gelöscht");
    },
    onError: (e: any) => toast.error(e?.message ?? "Löschen fehlgeschlagen"),
  });
}
