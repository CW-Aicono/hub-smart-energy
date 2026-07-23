import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Reads a single row from `public.system_settings`. Only keys with the
 * `public.` prefix are readable by regular authenticated users (see RLS).
 */
export function useSystemSetting(key: string) {
  return useQuery({
    queryKey: ["system-setting", key],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return (data?.value as string | null) ?? null;
    },
    staleTime: 60_000,
  });
}

export function useSystemSettingNumber(key: string, fallback: number): number {
  const { data } = useSystemSetting(key);
  const parsed = data != null ? Number(data) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function useSetSystemSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from("system_settings")
        .upsert({ key, value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["system-setting", v.key] });
      toast({ title: "Gespeichert", description: v.key });
    },
    onError: (err: any) => {
      toast({
        title: "Fehler beim Speichern",
        description: err?.message ?? "Unbekannter Fehler",
        variant: "destructive",
      });
    },
  });
}
