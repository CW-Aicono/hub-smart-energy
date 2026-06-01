import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { usePartnerAccess } from "@/hooks/usePartnerAccess";
import PartnerSidebar from "./PartnerSidebar";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PartnerLayoutProps {
  children: ReactNode;
}

/**
 * Stufe 2 (Partner-Portal): Layout-Wrapper für alle /partner/*-Routen.
 * Zugriff: Partner-Mitglieder ODER Super-Admin (für Vorschau / Support).
 */
export function PartnerLayout({ children }: PartnerLayoutProps) {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();
  const { isPartnerMember, loading: partnerLoading } = usePartnerAccess();

  if (authLoading || saLoading || partnerLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!isPartnerMember && !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="text-center space-y-4 max-w-md">
          <Briefcase className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">Kein Zugriff auf das Partner-Portal</h1>
          <p className="text-muted-foreground">
            Dieser Bereich ist nur für AICONO-Vertriebspartner. Bitte wende dich an deinen Administrator.
          </p>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>Zur Startseite</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <PartnerSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
