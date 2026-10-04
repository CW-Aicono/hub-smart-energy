import { useState } from "react";
import { useSupportSession } from "@/hooks/useSupportSession";
import { useTranslation } from "@/hooks/useTranslation";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { clearImpersonation, getActiveSupportSessionId, getActiveSupportTenantId, isImpersonating, endImpersonationAndReturn } from "@/lib/supportView";

export default function SupportSessionBanner() {
  const { isActive, session } = useSupportSession();
  const { t } = useTranslation();
  const { isSuperAdmin } = useSuperAdmin();
  const queryClient = useQueryClient();
  const [ending, setEnding] = useState(false);

  if (!isActive) return null;
  // Super-Admins haben eine eigene Impersonation-Leiste mit Beenden-Button
  if (isSuperAdmin) return null;

  const endSession = async () => {
    if (!session) return;
    setEnding(true);
    try {
      // Wenn eine Super-Admin-Impersonation aktiv ist, sauber zurück in den
      // Super-Admin (Original-Session wiederherstellen + Hard-Reload).
      if (isImpersonating()) {
        toast.success("Remote-Support beendet");
        await endImpersonationAndReturn(supabase, {
          sessionId: getActiveSupportSessionId() ?? session.id,
          tenantId: getActiveSupportTenantId(),
        });
        return; // Hard-Reload – kein Code danach
      }

      // Fallback (keine Impersonation, nur Session-Marker beenden)
      await supabase
        .from("support_sessions")
        .update({ ended_at: new Date().toISOString() } as any)
        .eq("id", session.id);
      if (getActiveSupportSessionId() === session.id) clearImpersonation();
      queryClient.invalidateQueries({ queryKey: ["active-support-session"] });
      toast.success("Remote-Support beendet");
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
      onClick={endSession}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") endSession(); }}
      title="Klicken zum Beenden der Support-Sitzung"
      className="sticky top-0 left-0 right-0 z-[60] w-full bg-destructive text-destructive-foreground px-4 pb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 shadow-lg animate-in slide-in-from-top-2 cursor-pointer hover:brightness-110 transition"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="text-sm font-semibold">
        {t("support_banner.active" as any)}
      </span>
      <span className="text-sm">
        seit {new Date(session!.started_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={(e) => { e.stopPropagation(); endSession(); }}
        disabled={ending}
        className="h-7 text-xs gap-1"
      >
        <LogOut className="h-3 w-3" />
        Beenden
      </Button>
    </div>
  );
}
