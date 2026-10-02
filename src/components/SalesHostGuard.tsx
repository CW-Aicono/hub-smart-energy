import { useLocation, Navigate } from "react-router-dom";
import { isSalesHost } from "@/lib/hostname";

/**
 * Sales-Subdomain-Guard.
 *
 * Auf sales.aicono.org darf ausschließlich die Sales-Scout-PWA (/sales/*)
 * erreichbar sein. Alle anderen Routen (z. B. /partner, /super-admin,
 * /locations, …) werden hart auf /sales umgeleitet — auch wenn der User
 * eingeloggt ist und eine andere Rolle hat.
 *
 * Ausgenommen sind nur Auth-/Passwort-Routen, damit Login & Einladungen
 * weiterhin funktionieren.
 */
const ALLOWED_PREFIXES = [
  "/sales",
  "/auth",
  "/set-password",
  "/accept-invite",
];

export default function SalesHostGuard() {
  const location = useLocation();

  if (!isSalesHost()) return null;

  const path = location.pathname;
  const isAllowed = ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"),
  );

  if (isAllowed) return null;

  return <Navigate to="/sales" replace />;
}
