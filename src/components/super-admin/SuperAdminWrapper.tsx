import { ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { ShieldAlert, Eye } from "lucide-react";
import { SAPreferencesProvider } from "@/hooks/useSuperAdminPreferences";
import { usePortalAccess, portalAreaForPath } from "@/hooks/usePortalAccess";
import { Button } from "@/components/ui/button";

/** Zugriffsschutz für alle Seiten des AICONO Portals (Bereich je Adresse). */
export function SuperAdminWrapper({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { loading, isPortalMember, canRead, canWrite } = usePortalAccess();
  const area = portalAreaForPath(pathname);

  let content: ReactNode = children;
  if (loading) {
    content = <div className="flex min-h-screen items-center justify-center text-muted-foreground">Lädt…</div>;
  } else if (!isPortalMember) {
    return <Navigate to="/" replace />;
  } else if (!canRead(area)) {
    content = (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h1 className="text-xl font-semibold">Kein Zugriff</h1>
        <p className="max-w-md text-muted-foreground">
          Für diesen Bereich des AICONO Portals fehlt Ihnen die Berechtigung. Bitte wenden Sie sich an einen Portal-Admin.
        </p>
        <Button asChild variant="outline"><Link to="/super-admin">Zur Übersicht</Link></Button>
      </div>
    );
  } else if (!canWrite(area)) {
    content = (
      <>
        <div className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" /> Nur Ansicht – Änderungen werden vom System abgelehnt.
        </div>
        {children}
      </>
    );
  }

  return <SAPreferencesProvider>{content}</SAPreferencesProvider>;
}
