import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * A1: If the authenticated user has user_metadata.must_change_password === true,
 * redirect them to /set-password until they pick a personal password.
 * The SetPassword page clears the flag via supabase.auth.updateUser().
 */
const ALLOWED_PATHS = new Set(["/set-password", "/auth", "/accept-invite"]);

export default function MustChangePasswordGuard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    const mustChange =
      (user.user_metadata as Record<string, unknown> | undefined)?.must_change_password === true;
    if (!mustChange) return;
    if (ALLOWED_PATHS.has(location.pathname)) return;
    if (location.pathname.startsWith("/public/")) return;
    navigate("/set-password", { replace: true });
  }, [user, location.pathname, navigate]);

  return null;
}
