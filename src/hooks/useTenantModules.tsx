import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export const ALL_MODULES = [
  { code: "dashboard", label: "Dashboard", alwaysOn: true },
  { code: "locations", label: "Standortverwaltung (alle Liegenschaften)" },
  { code: "integrations", label: "Integrationen" },
  { code: "floor_plans", label: "Grundrisse" },
  { code: "energy_monitoring", label: "Energiemonitoring" },
  { code: "reporting", label: "Berichte" },
  { code: "automation_building", label: "Automation (Gebäudeebene)" },
  { code: "automation_multi", label: "Multi-Location Automation" },
  { code: "ev_charging", label: "Ladeinfrastruktur" },
  { code: "alerts", label: "Alarmregeln" },
  { code: "meter_scanning", label: "Zähler-Scanning (OCR)" },
  { code: "live_values", label: "Live-Sensorwerte" },
  { code: "network_infra", label: "Netzwerkinfrastruktur" },
] as const;

export function useTenantModules(tenantId: string | null) {
  const queryClient = useQueryClient();

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["tenant-modules", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_modules")
        .select("*")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return data;
    },
  });

  const toggleModule = useMutation({
    mutationFn: async ({ moduleCode, enabled }: { moduleCode: string; enabled: boolean }) => {
      if (!tenantId) throw new Error("No tenant");
      const existing = modules.find((m) => m.module_code === moduleCode);
      if (existing) {
        const { error } = await supabase
          .from("tenant_modules")
          .update({
            is_enabled: enabled,
            enabled_at: enabled ? new Date().toISOString() : existing.enabled_at,
            disabled_at: enabled ? null : new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tenant_modules")
          .insert({ tenant_id: tenantId, module_code: moduleCode, is_enabled: enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-modules", tenantId] });
      toast({ title: "Modul aktualisiert" });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const isModuleEnabled = (code: string): boolean => {
    const mod = modules.find((m) => m.module_code === code);
    return mod ? mod.is_enabled : false;
  };

  return { modules, isLoading, toggleModule, isModuleEnabled };
}
