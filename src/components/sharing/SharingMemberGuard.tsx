import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyMembership } from "@/hooks/useMyMembership";
import { SharingLayout } from "./SharingLayout";

/**
 * Guards member-only PWA routes:
 * - Redirects to /mein-sharing/login if no session
 * - Shows a friendly "no membership found" notice if logged in but no
 *   community_members row matches the email
 */
export function SharingMemberGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = useMyMembership();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/mein-sharing/login", { replace: true });
    }
  }, [authLoading, user, navigate]);

  if (authLoading || isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.active) {
    return (
      <SharingLayout title="Kein Mitgliedschafts-Zugang">
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground space-y-2">
          <p>
            Für die E-Mail-Adresse <span className="font-medium text-foreground">{user.email}</span>{" "}
            wurde keine aktive Community-Mitgliedschaft gefunden.
          </p>
          <p>
            Bitte wende dich an deinen Community-Betreiber, damit du eingeladen wirst, oder melde
            dich mit der E-Mail-Adresse an, mit der du beigetreten bist.
          </p>
        </div>
      </SharingLayout>
    );
  }

  return <>{children}</>;
}
