## Ziel
Tenant-Admins können in den Tenant-Einstellungen (Route `/settings/branding`) einen automatischen Logout bei Inaktivität aktivieren/deaktivieren und die Zeitdauer einstellen. Angemeldete Nutzer werden nach Ablauf der eingestellten Zeit automatisch abgemeldet — auch wenn der Browser zwischenzeitlich geschlossen wurde.

## UI: Neue Karte „Auto-Logout"
Neue Komponente `src/components/settings/AutoLogoutSetting.tsx`, eingebunden in `src/pages/Branding.tsx` **zwischen** `WeekStartSetting` und `ManualMetersSetting`.

Aufbau (analog zu `WeekStartSetting`, gleiches Card-Layout):
- Titel „Auto-Logout" mit Icon (`LogOut` aus lucide-react).
- Beschreibung: „Nutzer werden bei Inaktivität automatisch abgemeldet."
- Switch „Auto-Logout aktiv" (Default: an).
- Wenn aktiv: Select mit den Optionen **10, 20, 30, 60, 120 Minuten** (Default: 30).
- Speichern-Button.

## Datenmodell
Migration erweitert `public.tenants`:
- `auto_logout_enabled boolean NOT NULL DEFAULT true`
- `auto_logout_minutes integer NOT NULL DEFAULT 30 CHECK (auto_logout_minutes IN (10, 20, 30, 60, 120))`

Keine neuen RLS-Policies nötig — Tenants-Tabelle wird bereits vom Tenant-Admin (und Super-Admin) beschrieben, wie bei `week_start_day`.

## Logout-Logik (Frontend)
Neuer Hook `src/hooks/useAutoLogout.ts`, global aktiviert in `src/App.tsx` innerhalb des bestehenden Auth-/Tenant-Contexts.

**Inaktivitäts-Erkennung (offener Browser):**
- Listener auf `mousemove`, `keydown`, `click`, `scroll`, `touchstart`, `visibilitychange`.
- Bei jedem Event wird `localStorage["aicono.lastActivity"] = Date.now()` gesetzt (throttled auf 1×/Sekunde).
- Ein Interval (alle 30 s) prüft `Date.now() - lastActivity > timeoutMs`. Wenn ja: `supabase.auth.signOut()` + Redirect auf `/auth`.
- Timer nutzt die tenant-spezifische Dauer aus `tenant.auto_logout_minutes`; wenn `auto_logout_enabled = false`, ist der Hook no-op.

**Session-Ablauf über Browser-Neustart (Kernanforderung):**
- Beim App-Start (nach Hydrierung von Auth + Tenant) prüft der Hook **vor** jeder anderen Aktion:
  ```
  if (enabled && lastActivity && Date.now() - lastActivity > timeoutMs) {
    await supabase.auth.signOut();
    navigate("/auth");
  }
  ```
- Damit greift der Auto-Logout auch, wenn der Nutzer den Browser gestern Abend einfach geschlossen hat und heute wieder öffnet — die Session wird sofort beim Laden invalidiert, bevor geschützte Inhalte gerendert werden.
- `lastActivity` liegt in `localStorage` (überlebt Browser-Neustart, gebunden an Origin/Profil).

**Cross-Tab-Konsistenz:**
- Ein `storage`-Event-Listener synchronisiert `lastActivity` zwischen mehreren Tabs, sodass Aktivität in einem Tab die anderen Tabs am Leben hält und der Logout in allen Tabs gleichzeitig auslöst.

## Technische Details
- Migration fügt die zwei Spalten hinzu; anschließend Typen-Regeneration (`src/integrations/supabase/types.ts` wird automatisch aktualisiert).
- `useTenant` liefert die neuen Felder ohne Änderung mit (SELECT *).
- i18n: Neue Keys `autoLogout.title/subtitle/enabled/minutes/saved/saveError` in allen 4 Sprachen (DE/EN/ES/NL).
- Kein Eingriff in Edge Functions, keine Änderung an bestehenden Auth-Flows.

## Betroffene/neue Dateien
- **Neu:** `supabase/migrations/<ts>_add_auto_logout_to_tenants.sql`
- **Neu:** `src/components/settings/AutoLogoutSetting.tsx`
- **Neu:** `src/hooks/useAutoLogout.ts`
- **Edit:** `src/pages/Branding.tsx` — Karte einfügen
- **Edit:** `src/App.tsx` — Hook global aktivieren
- **Edit:** i18n-Dateien (DE/EN/ES/NL) — neue Übersetzungs-Keys

## Hinweise / offene Punkte
- Die Anforderung „auch wenn er den Browser geschlossen hat" wird über `localStorage` + Prüfung beim Reload gelöst. Es gibt technisch keine Möglichkeit, einen Server-seitigen Logout auszulösen, während der Browser komplett geschlossen ist — Supabase-Sessions laufen erst nach ihrer eigenen Refresh-Token-Lebensdauer ab. Der beschriebene Ansatz stellt aber sicher, dass der Nutzer nach Wiederöffnen **sofort und ohne Zugriff auf geschützte Inhalte** ausgeloggt wird, was den Sicherheitswunsch erfüllt.
- Super-Admin-Impersonation-Sessions bleiben unberührt (der Hook prüft nur Tenant-Sessions).
