import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Global guard that redirects to /set-password when:
 * 1. The URL hash contains type=recovery (fresh recovery link click)
 * 2. The user is in recovery mode (PASSWORD_RECOVERY event fired)
 *
 * Allows /set-password and /auth routes to render normally.
 */
export default function RecoveryGuard() {
  const { isRecovery, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check URL hash for type=recovery (covers initial redirect from Supabase)
    const hash = window.location.hash;
    const hasRecoveryHash = hash.includes("type=recovery");

    const shouldRedirect = hasRecoveryHash || (isRecovery && user);
    const isAllowedPath = location.pathname === "/set-password" || 
                          location.pathname === "/auth" ||
                          location.pathname === "/accept-invite";

    if (shouldRedirect && !isAllowedPath) {
      navigate("/set-password", { replace: true });
    }
  }, [isRecovery, user, location.pathname, navigate]);

  return null;
}