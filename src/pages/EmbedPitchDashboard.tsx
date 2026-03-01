import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardFilterProvider } from "@/hooks/useDashboardFilter";

const DashboardContent = lazy(() => import("./DashboardContent"));

export default function EmbedPitchDashboard() {
  const [status, setStatus] = useState<"loading" | "authenticated" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const apiKey = params.get("key") || "";

    if (!apiKey) {
      setError("Missing API key");
      setStatus("error");
      return;
    }

    // Check if we already have a valid session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus("authenticated");
        return;
      }

      // Exchange pitch API key for a session
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pitch-session`;
      fetch(url, {
        headers: { "x-pitch-api-key": apiKey },
      })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(async (session) => {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
          if (setErr) throw setErr;
          setStatus("authenticated");
        })
        .catch((e) => {
          setError(e.message);
          setStatus("error");
        });
    });
  }, []);

  if (status === "error") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <DashboardFilterProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen bg-background">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </DashboardFilterProvider>
  );
}
