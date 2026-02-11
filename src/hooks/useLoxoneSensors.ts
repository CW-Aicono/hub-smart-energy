import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LoxoneSensor {
  id: string;
  name: string;
  type: string;
  controlType: string;
  room: string;
  category: string;
  value: string;
  rawValue: number | null;
  unit: string;
  status: string;
  stateName: string;
  secondaryValue: string;
  secondaryStateName: string;
  secondaryUnit: string;
  totalDay: number | null;
}

export function useLoxoneSensors(integrationId: string | undefined) {
  return useQuery<LoxoneSensor[]>({
    queryKey: ["loxone-sensors", integrationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("loxone-api", {
        body: { locationIntegrationId: integrationId, action: "getSensors" },
      });
      if (error || !data?.success) throw new Error("Failed to fetch sensors");
      return data.sensors as LoxoneSensor[];
    },
    enabled: !!integrationId,
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
}
