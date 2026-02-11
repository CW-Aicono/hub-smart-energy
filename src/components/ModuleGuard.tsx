import { Navigate, useLocation } from "react-router-dom";
import { useModuleGuard } from "@/hooks/useModuleGuard";

interface ModuleGuardProps {
  children: React.ReactNode;
}

/**
 * Wraps routes to redirect to dashboard if the module is disabled for the tenant.
 */
const ModuleGuard = ({ children }: ModuleGuardProps) => {
  const location = useLocation();
  const { isRouteAllowed, isLoading } = useModuleGuard();

  if (isLoading) return null;

  if (!isRouteAllowed(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ModuleGuard;
