import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/** Bereiche im AICONO Portal. */
export type PortalArea = "overview" | "commercial" | "technical" | "roadmap" | "admin";
export type PortalRole = "super_admin" | "portal_commercial" | "portal_technical";

/** Spiegelt die SQL-Funktionen can_portal_read/can_portal_write – nur für die Oberfläche. */
export function portalCanWrite(roles: PortalRole[], area: PortalArea): boolean {
  if (roles.includes("super_admin")) return true;
  if (area === "admin") return false;
  if ((area === "overview" || area === "commercial") && roles.includes("portal_commercial")) return true;
  if ((area === "technical" || area === "roadmap") && roles.includes("portal_technical")) return true;
  return false;
}
export function portalCanRead(roles: PortalRole[], area: PortalArea): boolean {
  return portalCanWrite(roles, area) || ((area === "overview" || area === "roadmap") && roles.length > 0);
}

/** Bestimmt den Bereich einer /super-admin-Adresse. */
export function portalAreaForPath(path: string): PortalArea {
  const p = path.replace(/\/+$/, "") || "/super-admin";
  if (p === "/super-admin/roadmap") return "roadmap";
  if (/^\/super-admin\/(users|roles|settings)/.test(p)) return "admin";
  if (/^\/super-admin\/(billing|licenses|savings-share|module-pricing|bundles)/.test(p)) return "commercial";
  if (/^\/super-admin\/(gateways|loxone-templates|wallbox-templates|ocpp|monitoring|support|worker-controls)/.test(p)) return "technical";
  return "overview";
}

export function usePortalAccess() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["portal-roles", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_roles", { _uid: user!.id });
      if (!error) return (data ?? []) as PortalRole[];
      // Fallback, falls die Datenbank (z. B. Live vor Migration) portal_roles noch nicht kennt:
      // eigene Rollen direkt lesen. Nur Navigation – RLS schützt die Daten weiterhin.
      console.error("portal_roles failed, fallback to user_roles", error);
      const { data: rows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      const allowed: PortalRole[] = ["super_admin", "portal_commercial", "portal_technical"];
      return (rows ?? [])
        .map((r: any) => r.role as PortalRole)
        .filter((r) => allowed.includes(r));
    },
  });
  const roles = data ?? [];
  return {
    loading: !!user && isLoading,
    roles,
    isPortalMember: roles.length > 0,
    isPortalAdmin: roles.includes("super_admin"),
    canRead: (a: PortalArea) => portalCanRead(roles, a),
    canWrite: (a: PortalArea) => portalCanWrite(roles, a),
  };
}

/**
 * Kompatibilitäts-Hook für Portal-Seiten: liefert isSuperAdmin = Portal-Mitglied.
 * Welche Seite erlaubt ist, entscheidet SuperAdminWrapper; die Daten schützt RLS.
 */
export function usePortalMember() {
  const { isPortalMember, loading } = usePortalAccess();
  return { isSuperAdmin: isPortalMember, loading };
}
