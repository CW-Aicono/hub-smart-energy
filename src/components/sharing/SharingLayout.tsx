import { ReactNode, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, UserCog, LogOut, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  title?: string;
}

const navItems = [
  { to: "/mein-sharing/dashboard", label: "Übersicht", icon: LayoutDashboard },
  { to: "/mein-sharing/rechnungen", label: "Rechnungen", icon: FileText },
  { to: "/mein-sharing/onboarding", label: "Stammdaten", icon: UserCog },
];

export function SharingLayout({ children, title }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Swap the page manifest so the PWA installs as "Meine Energie-Community"
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const prev = link?.getAttribute("href") ?? null;
    if (link) link.setAttribute("href", "/manifest-sharing.json");
    else {
      const el = document.createElement("link");
      el.rel = "manifest";
      el.href = "/manifest-sharing.json";
      el.id = "sharing-manifest";
      document.head.appendChild(el);
    }
    return () => {
      const cur = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (cur && prev !== null) cur.setAttribute("href", prev);
      else if (cur && cur.id === "sharing-manifest") cur.remove();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/mein-sharing/login");
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <header className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-primary" />
            <span className="font-semibold">Meine Energie-Community</span>
          </div>
          {user?.email && (
            <button
              onClick={handleLogout}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title="Abmelden"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          )}
        </div>
      </header>


      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 pb-24">
        {title && <h1 className="text-xl font-semibold mb-4">{title}</h1>}
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 border-t bg-card/95 backdrop-blur z-40">
        <div className="max-w-2xl mx-auto grid grid-cols-3">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 py-3 text-xs",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
