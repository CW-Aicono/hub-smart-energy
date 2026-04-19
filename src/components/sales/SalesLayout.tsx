import { ReactNode, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, ArrowLeft, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSalesPartner } from "@/hooks/useSalesPartner";
import { Skeleton } from "@/components/ui/skeleton";

interface SalesLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  backTo?: string;
  action?: ReactNode;
}

export function SalesLayout({ children, title = "Sales Scout", showBack, backTo, action }: SalesLayoutProps) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { hasAccess, loading } = useSalesPartner();

  // Set PWA manifest & Apple meta for the Sales Scout PWA (Add-to-Homescreen)
  useEffect(() => {
    let link = document.querySelector("link[rel='manifest']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    const previous = link.href;
    link.href = "/manifest-sales.json";

    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const previousTitle = meta?.getAttribute("content");
    if (meta) meta.setAttribute("content", "Sales Scout");

    return () => {
      if (link && previous) link.href = previous;
      if (meta && previousTitle) meta.setAttribute("content", previousTitle);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Bitte anmelden, um fortzufahren.</p>
          <Button onClick={() => navigate("/auth")}>Anmelden</Button>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <Briefcase className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">Kein Zugriff</h1>
          <p className="text-muted-foreground">
            Dieser Bereich ist nur für Vertriebspartner. Bitte kontaktiere den Administrator.
          </p>
          <Button variant="outline" onClick={() => navigate("/")}>Zur Startseite</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur border-b">
        <div className="flex items-center justify-between px-4 h-14 max-w-3xl mx-auto w-full">
          <div className="flex items-center gap-2 min-w-0">
            {showBack ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            ) : (
              <Link to="/sales" className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
              </Link>
            )}
            <h1 className="font-semibold truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-1">
            {action}
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-4 pb-24">{children}</main>
    </div>
  );
}

export function SalesFab({ to, label = "Neu" }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg px-5 py-3 hover:opacity-90 transition"
    >
      <Plus className="h-5 w-5" />
      <span className="font-medium">{label}</span>
    </Link>
  );
}
