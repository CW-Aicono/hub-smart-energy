import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { MobileHeader } from "@/components/dashboard/MobileSidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Standard layout wrapper for all authenticated pages.
 * Renders the desktop sidebar + mobile hamburger header.
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background flex-col md:flex-row">
      <MobileHeader />
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
