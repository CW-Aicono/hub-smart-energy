import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenantOptional } from "./useTenant";

const STORAGE_KEY = "aicono.lastActivity";
const CHECK_INTERVAL_MS = 30_000;
const ACTIVITY_THROTTLE_MS = 1_000;
export const AUTO_LOGOUT_FLAG_KEY = "aicono.autoLogoutNotice";

/**
 * Auto-Logout bei Inaktivität.
 * - Trackt Aktivität in localStorage (überlebt Browser-Neustart).
 * - Beim App-Start und periodisch: prüft, ob timeout überschritten -> signOut.
 * - Cross-Tab: Aktivität in einem Tab hält andere Tabs am Leben.
 */
export function useAutoLogout() {
  const { user } = useAuth();
  const tenantCtx = useTenantOptional();
  const navigate = useNavigate();
  const loggingOutRef = useRef(false);

  const enabled = !!user && !!tenantCtx?.tenant && tenantCtx.tenant.auto_logout_enabled !== false;
  const timeoutMs = ((tenantCtx?.tenant?.auto_logout_minutes as number | undefined) ?? 30) * 60_000;

  useEffect(() => {
    if (!enabled) return;

    const doLogout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(AUTO_LOGOUT_FLAG_KEY, "1");
        await supabase.auth.signOut();
      } finally {
        navigate("/auth", { replace: true });
      }
    };

    const isExpired = () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false; // erster Aufruf -> gleich unten initialisiert
      const last = Number(raw);
      if (!Number.isFinite(last)) return false;
      return Date.now() - last > timeoutMs;
    };

    const userKey = `${STORAGE_KEY}:user`;
    const storedUser = localStorage.getItem(userKey);
    if (storedUser !== user.id) {
      // Anderer/erster User in diesem Browser -> Timer neu starten,
      // alten Wert nicht als 'abgelaufen' werten.
      localStorage.setItem(userKey, user.id);
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } else if (isExpired()) {
      // Gleicher User, Browser war zu lange geschlossen -> Logout.
      void doLogout();
      return;
    } else if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }



    let lastWrite = 0;
    const bump = () => {
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_THROTTLE_MS) return;
      lastWrite = now;
      localStorage.setItem(STORAGE_KEY, String(now));
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const onVisibility = () => {
      if (document.visibilityState === "visible" && isExpired()) {
        void doLogout();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      // Andere Tabs aktualisieren -> nichts weiter zu tun, Wert ist da.
    };
    window.addEventListener("storage", onStorage);

    const interval = window.setInterval(() => {
      if (isExpired()) void doLogout();
    }, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, [enabled, timeoutMs, navigate]);

  // Sauber machen, sobald User ausgeloggt ist.
  useEffect(() => {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      loggingOutRef.current = false;
    }
  }, [user]);
}

export function AutoLogoutMount() {
  useAutoLogout();
  return null;
}
