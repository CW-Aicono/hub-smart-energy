# Remote-Support-Ansicht: Analyse und Lösungsvorschlag

## Was die Screenshots zeigen

| | Tenant-Admin (rote Leiste) | Super-Admin-Support (lila Leiste) |
|---|---|---|
| Sidebar-Reihenfolge | individuell sortiert | andere Reihenfolge |
| Energieverbrauch Monat | tägliche Balken vom 1.–31. | nur ein Balken am 31. (heute), Werte stark reduziert |
| Gauges | echte Live-Werte (8,6 kW etc.) | leere/abweichende Werte |

## Warum das passiert (technischer Befund)

Der aktuelle Support-Modus überschreibt nur `tenant.id` im Frontend (`useTenant` liest `support_view_tenant_id` aus sessionStorage). Alles, was **am Backend an `auth.uid()` oder am Backend an die Login-Identität gebunden ist**, bleibt aber der Super-Admin:

1. **Dashboard-Layout** wird in `dashboard_widgets` **pro `user_id`** gespeichert (`useDashboardWidgets.tsx`, Z. 73 `.eq("user_id", user.id)`). Der Support sieht also seine eigene Widget-Reihenfolge / Größen, nicht die des Tenant-Admins. Daher die "falsche Reihenfolge".

2. **Aggregations-RPCs** wie `get_meter_daily_totals_split_with_fallback` rufen intern `get_user_tenant_id()` auf. Diese Funktion liest die Tenant-ID **aus `auth.uid()`** des eingeloggten Users — beim Super-Admin ist das NULL oder seine eigene Tenant-ID, **nicht** der Support-Ziel-Tenant. Ergebnis: archivierte Tageswerte (`meter_period_totals`) werden gar nicht gefunden, nur der "Heute"-Fallback aus laufenden Power-Readings liefert noch etwas. Genau das sieht man im Screenshot (nur Balken am 31.).

3. Gleiches Muster betrifft praktisch **alle** SECURITY DEFINER RPCs (Spotpreise, PV-Forecast, EMS-Copilot, Reports, Sustainability KPIs …) sowie alle User-Settings (Sprache, Theme, Favoriten, Lesezeichen).

Die in den letzten Iterationen hinzugefügten `super_admin`-RLS-Policies helfen nur für **direkte Tabellen-Selects**. RPCs mit eigener WHERE-Logik auf `get_user_tenant_id()` bleiben blind.

## Bewertung der beiden Vorschläge

### Vorschlag A: "Ansicht spiegeln" (jede Stelle support-aware machen)
- Erfordert: `get_user_tenant_id()` und ca. 30–50 RPCs umbauen, damit sie eine optionale `p_tenant_id` akzeptieren bzw. die Support-Session aus einer Server-Side-Source lesen.
- Zusätzlich: `dashboard_widgets`, `user_preferences`, Locale etc. müssten ebenfalls auf den Ziel-Tenant umgeleitet werden (z. B. via `effective_user_id`).
- Großer Eingriff, hohe Regressionsgefahr, dauerhafte Wartungslast (jede neue RPC muss daran denken).

### Vorschlag B: Versteckter Support-User je Tenant
- Pro Tenant ein technischer User `support+<tenant>@…` mit `admin`-Rolle anlegen, der nur für Support-Sessions verwendet wird.
- Super-Admin startet die Session → Edge Function `start-support-session` tauscht (mit Service-Role-Key) die Session des Super-Admins gegen einen **kurzlebigen JWT** dieses Support-Users (z. B. via `auth.admin.generateLink` + `verifyOtp`, oder eigene signierte Session über `auth.admin.createSession` Pattern).
- Frontend: `supabase.auth.setSession({access_token, refresh_token})` → ab jetzt ist `auth.uid()` der Tenant-Support-User. **Alle** RPCs, RLS-Policies, Widgets, Preferences, Tracking funktionieren ohne Codeänderung exakt wie für einen Tenant-Admin.
- Beim "Beenden": gespeicherter Original-Token des Super-Admins wird zurückgesetzt.
- Vorteil: minimaler Code, keine Folgekosten, jede neue Funktion ist automatisch support-fähig.
- Sicherheit: jede Aktion in der Support-Session wird zusätzlich in `support_sessions` + `support_audit_log` mit Original-User-ID protokolliert (Compliance).

**Empfehlung: Vorschlag B** — er liefert echte 1:1-Spiegelung ohne jede Hook/RPC umbauen zu müssen, und passt zu allen zukünftigen Features.

## Umsetzungsplan (wenn B freigegeben)

### Phase 1 — Backend
1. Neue Tabelle `tenant_support_users (tenant_id, auth_user_id)` (1 Zeile pro Tenant).
2. Migration: für jeden bestehenden Tenant einen User `support+<short>@aicono.internal` anlegen (`auth.users` via service role), `profiles`-Eintrag mit `tenant_id`, `user_roles`-Eintrag mit Rolle `admin`. Kein Login per Passwort möglich (Random-Hash, E-Mail unbestätigt egal, da Login nur über Edge Function).
3. Edge Function `support-session-impersonate`:
   - Eingang: `target_tenant_id`, `reason`. Verifiziert: Caller ist `super_admin`.
   - Legt Eintrag in `support_sessions` an (wie heute, 15 min TTL).
   - Erzeugt mit Service Role einen Magic-Link / signierten Session-Token für den Support-User des Tenants und gibt `access_token` + `refresh_token` zurück.
4. Edge Function `support-session-end`: schließt Session, gibt nichts zurück (Frontend stellt Original-Token wieder her).
5. Audit-Trigger: jeder Insert/Update/Delete unter Support-User schreibt in `support_audit_log` (User-ID + Original-Super-Admin-ID aus `support_sessions`).

### Phase 2 — Frontend
6. `SuperAdminSupport.tsx` → beim Start: aktuellen `supabase.auth.getSession()` in sessionStorage (`super_admin_original_session`) sichern, Impersonations-Tokens via `supabase.auth.setSession()` setzen, dann auf `/` navigieren.
7. Roter Banner bleibt sichtbar (eigenes Hook `useSupportSession` → ersetzt das aktuelle Polling auf `support_sessions`).
8. "Beenden" → `support-session-end` aufrufen, dann Original-Session via `supabase.auth.setSession(saved)` zurücksetzen, auf `/super-admin/support` navigieren.
9. `support_view_tenant_id`-sessionStorage und `useTenant`-Override **entfernen** (nicht mehr nötig).
10. Alle in den letzten Iterationen für `support_view_tenant_id` angepassten Hooks (`useChargePoints`, `useEnergyData`, `useAlertRules`, `useUserRole` super_admin→admin Mapping etc.) **zurückbauen** auf den einfachen Tenant-Filter — sie funktionieren dann von selbst, weil `auth.uid()` jetzt korrekt der Support-User ist.

### Phase 3 — Cleanup
11. Migration `20260531091839_…` (super_admin SELECT-Policies auf ~50 Tabellen) kann **entfernt** werden, da Super-Admin in Support-Sessions nicht mehr direkt auf Tenant-Tabellen zugreift. Reduziert Angriffsfläche.

## Risiken / offene Fragen
- Tokens für Support-User müssen kurzlebig (≤15 min, identisch zur Session-TTL) und an die `support_sessions.id` gekoppelt sein. Server-seitige Sperre, wenn Session abgelaufen ist → Refresh-Token revoken.
- Lexware-/Charging-Invoice-Generierung erzeugt evtl. Audit-Spuren mit "falschem" User → `support_audit_log` muss in Reports den Original-Super-Admin nachvollziehbar machen.
- Live-Deployment: Migration für vorhandene Tenants muss idempotent sein (gleiches Muster wie zuletzt: `to_regclass` / `IF NOT EXISTS`).

## Erwartung nach Umsetzung
- Support-Ansicht ist **byte-identisch** zur Tenant-Admin-Ansicht: gleiche Widget-Reihenfolge, gleiche Monats-Historie, gleiche Gauges, gleiche Berechtigungen — ohne dass je wieder ein einzelner Hook oder eine RPC angefasst werden muss.
