import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useDemoMode } from "@/contexts/DemoMode";

/**
 * Route prefix → required "view" permission for users with a custom role.
 * Longest matching prefix wins. Routes not listed need no permission.
 */
export const ROUTE_PERMISSION_MAP: Record<string, string> = {
  "/locations": "locations.view",
  "/energy-data": "energy.view",
  "/meters": "meters.view",
  "/live-values": "live_values.view",
  "/analytics-studio": "energy.view",
  "/energy-report": "reports.view",
  "/charging/points": "charging.view",
  "/charging/users": "charging.users_manage",
  "/charging/billing": "charging.billing_view",
  "/charging/reporting": "charging.view",
  "/charging/settings": "charging.app_manage",
  "/charging/transactions": "charging.payments.view",
  "/automation": "automation.view",
  "/network": "network.view",
  "/ppa": "ppa.view",
  "/documents": "documents.view",
  "/integrations": "integrations.view",
  "/roles": "roles.view",
  "/admin": "users.view",
  "/settings": "settings.view",
  "/settings/branding": "settings.branding",
  "/settings/email-templates": "email_templates.view",
};

/** Pure check: `codes === null` means unrestricted (admin or no custom role). */
export function isPathPermitted(path: string, codes: string[] | null): boolean {
  if (codes === null) return true;
  const match = Object.keys(ROUTE_PERMISSION_MAP)
    .filter((r) => path === r || path.startsWith(r + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (!match) return true;
  return codes.includes(ROUTE_PERMISSION_MAP[match]);
}

export function useMyPermissions() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const { data, isLoading } = useQuery<string[] | null>({
    queryKey: ["my-permission-codes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_permission_codes" as any);
      if (error) {
        console.error("Error loading permissions:", error);
        return null;
      }
      return (data as string[] | null) ?? null;
    },
    enabled: !!user && !isDemo,
    staleTime: 5 * 60 * 1000,
  });
  const codes = isDemo ? null : data ?? null;
  return {
    loading: isLoading && !!user && !isDemo,
    restricted: codes !== null,
    can: (code: string) => codes === null || codes.includes(code),
    isPathPermitted: (path: string) => isPathPermitted(path, codes),
  };
}
