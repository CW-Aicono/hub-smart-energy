import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/contexts/DemoMode";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * A2: Tenant lifecycle guard.
 * If the logged-in user's tenant is "suspended" or "deleted" (and they are not a
 * super_admin), block the entire app with a clear message and a sign-out button.
 */
type TenantStatus = "active" | "suspended" | "deleted" | null;

export default function TenantStatusGuard({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const isDemo = useDemoMode();
  const [status, setStatus] = useState<TenantStatus>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user || isDemo || isSuperAdmin) {
      setStatus(null);
      return;
    }
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.tenant_id) {
        if (!cancelled) setStatus(null);
        return;
      }
      const { data: tnt } = await supabase
        .from("tenants")
        .select("status, suspended_reason")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      if (cancelled) return;
      setStatus(((tnt as any)?.status as TenantStatus) ?? "active");
      setReason(((tnt as any)?.suspended_reason as string) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isDemo, isSuperAdmin]);

  if (status && status !== "active") {
    const isDeleted = status === "deleted";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-2xl border bg-card p-8 shadow-lg text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">
            {isDeleted ? "Mandant gelöscht" : "Mandant gesperrt"}
          </h1>
          <p className="text-sm text-muted-foreground mb-2">
            {isDeleted
              ? "Dieser Mandant wurde dauerhaft entfernt. Ein Zugriff ist nicht mehr möglich."
              : "Der Zugang Ihres Mandanten ist aktuell gesperrt. Bitte wenden Sie sich an Ihren Administrator oder AICONO Support."}
          </p>
          {reason && !isDeleted && (
            <p className="text-xs text-muted-foreground bg-muted rounded p-2 mb-4">
              Grund: {reason}
            </p>
          )}
          <Button variant="outline" className="mt-4" onClick={() => signOut()}>
            Abmelden
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
