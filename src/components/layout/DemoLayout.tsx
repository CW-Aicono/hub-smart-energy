import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

interface DemoLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout wrapper for demo pages – identical to AppLayout but adds a demo banner.
 * DashboardSidebar already renders MobileHeader internally.
 */
export function DemoLayout({ children }: DemoLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background flex-col md:flex-row">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="bg-primary text-primary-foreground px-4 py-2.5 text-center text-sm font-medium">
          🔍 Demo-Modus – Entdecken Sie alle Funktionen unserer Energiemanagement-Plattform
        </div>
        {children}
      </main>
    </div>
  );
}
