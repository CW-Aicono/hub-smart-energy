import { useLocation, Navigate } from "react-router-dom";
import { isBoardHost } from "@/lib/hostname";

/**
 * Board-Subdomain-Guard (C-Level Dashboard).
 *
 * Auf board.aicono.org darf ausschließlich die C-Level-PWA (/board/*)
 * erreichbar sein. Alle anderen Routen werden hart auf /board umgeleitet.
 * Auth-Routen bleiben erlaubt, damit Login & Passwort-Reset funktionieren.
 */
const ALLOWED_PREFIXES = [
  "/board",
  "/auth",
  "/set-password",
  "/accept-invite",
];

export default function BoardHostGuard() {
  const location = useLocation();

  if (!isBoardHost()) return null;

  const path = location.pathname;
  const isAllowed = ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"),
  );

  if (isAllowed) return null;

  return <Navigate to="/board" replace />;
}
