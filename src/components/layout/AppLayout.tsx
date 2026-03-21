import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Standard layout wrapper for all authenticated pages.
 * DashboardSidebar already renders MobileHeader internally.
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background flex-col md:flex-row">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
