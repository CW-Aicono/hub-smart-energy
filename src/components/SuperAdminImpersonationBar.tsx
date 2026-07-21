import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useTenant } from "@/hooks/useTenant";
import {
  getActiveSupportSessionId,
  getActiveSupportTenantId,
  clearImpersonation,
  onImpersonationChanged,
  endImpersonationAndReturn,
} from "@/lib/supportView";
import { Button } from "@/components/ui/button";
import { HeadsetIcon, LogOut } from "lucide-react";
import { toast } from "sonner";

/**
 * Persistente Top-Leiste, die nur erscheint, wenn ein Super-Admin
 * über „Remote-Support" einen Tenant live beobachtet.
 * Wird nicht innerhalb des Super-Admin-Bereichs angezeigt.
 */
export default function SuperAdminImpersonationBar() {
  const { isSuperAdmin } = useSuperAdmin();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();

  const [tenantId, setTenantId] = useState<string | null>(() => getActiveSupportTenantId());
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    return onImpersonationChanged(() => setTenantId(getActiveSupportTenantId()));
  }, []);

  if (!isSuperAdmin) return null;
  if (!tenantId) return null;
  // Nicht im Super-Admin-Bereich anzeigen (dort gibt es eigene Steuerung)
  if (location.pathname.startsWith("/super-admin")) return null;
  if (location.pathname.startsWith("/auth")) return null;

  const handleEnd = async () => {
    const sessionId = getActiveSupportSessionId();
    setEnding(true);
    try {
      if (sessionId) {
        await supabase.functions.invoke("support-session-end", {
          body: { session_id: sessionId },
        });
      }
      const tid = tenantId;
      // Original-Session des Super-Admins wiederherstellen
      const orig = getOriginalSession();
      if (orig) {
        await supabase.auth.setSession({
          access_token: orig.access_token,
          refresh_token: orig.refresh_token,
        });
      }
      clearImpersonation();
      toast.success("Remote-Support beendet");
      navigate(tid ? `/super-admin/tenants/${tid}` : "/super-admin/tenants");
    } catch (e: any) {
      toast.error("Beenden fehlgeschlagen: " + (e?.message ?? ""));
    } finally {
      setEnding(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleEnd}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleEnd(); }}
      title="Klicken zum Beenden der Support-Sitzung"
      className="fixed top-0 left-0 right-0 z-[70] bg-primary text-primary-foreground px-4 py-2 flex items-center justify-center gap-4 shadow-lg cursor-pointer hover:brightness-110 transition"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <HeadsetIcon className="h-4 w-4 shrink-0" />
      <span className="text-sm font-semibold">
        Super-Admin-Sicht: {tenant?.name ?? "Mandant"}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => { e.stopPropagation(); handleEnd(); }}
        disabled={ending}
        className="h-7 text-xs gap-1"
      >
        <LogOut className="h-3 w-3" />
        Remote-Support beenden
      </Button>
    </div>
  );
}
