# Welle 1 — Sicherheits-Sofortmaßnahmen (S1–S7)

Ziel: Sieben klar abgegrenzte Sicherheitslücken schließen, ohne neue Features zu bauen. Jede Maßnahme ist einzeln verifizierbar.

## S1 — `charge-point-auto-reboot` absichern
**Problem:** Edge Function läuft mit `verify_jwt=false` und ohne eigenen Auth-Check → jeder mit der URL kann beliebige Wallboxen rebooten.
**Fix:**
- In `supabase/functions/charge-point-auto-reboot/index.ts` Authorization-Header prüfen.
- Zwei erlaubte Aufrufer: (a) Cron via `SUPABASE_SERVICE_ROLE_KEY` (Header-Vergleich), (b) eingeloggte User mit Tenant-Zugriff auf den Charge-Point via `getClaims()` + RLS-Check.
- Bei Fehlauth → 401, sonst wie bisher.

## S2 — `gateway-ingest` GET-Routes mit Tenant-Scope
**Problem:** GET-Endpoints nutzen Service-Role-Client ohne `eq("tenant_id", ...)` → Cross-Tenant-Lesezugriff möglich.
**Fix:**
- Tenant-ID aus dem Gateway-Key (bereits beim Auth-Schritt aufgelöst) in allen GET-Branches strikt als `.eq("tenant_id", gatewayTenantId)` an jede Query anhängen.
- Code-Review: alle `supabase.from(...).select(...)` in `gateway-ingest/index.ts` GET-Pfade.

## S3 — `PartnerTenants` Remote-Support-Button hinter `isPartnerAdmin`
**Problem:** Button "Remote-Support starten" wird allen Partner-Membern angezeigt, nicht nur Admins.
**Fix:**
- In `src/pages/partner/PartnerTenants.tsx` Button nur rendern wenn `isPartnerAdmin === true`.
- Server-seitig zusätzlich in der aufgerufenen Funktion `support-session-impersonate` den Role-Check ergänzen (falls noch nicht vorhanden).

## S4 — `support-session-impersonate` Refresh-Token revoken
**Problem:** Beim Beenden der Support-Session bleibt der Refresh-Token gültig → Impersonation kann verlängert werden.
**Fix:**
- Beim Session-Ende `supabase.auth.admin.signOut(userId, 'others')` mit Service-Role aufrufen, um alle Refresh-Tokens der Impersonation zu invalidieren.
- Ablauf der Access-Tokens kurz halten (bereits konfiguriert prüfen).

## S5 — Sales-PWA `sales_projects` RLS verifizieren
**Problem:** Queries in der Sales-PWA filtern clientseitig nicht auf `user_id`/`tenant_id`. RLS-Status unklar.
**Fix:**
- RLS-Policies auf `sales_projects` prüfen und bei Bedarf nachziehen: Lese-/Schreibrechte nur für `auth.uid() = user_id` bzw. Mitglieder desselben Sales-Teams.
- Bei vorhandener RLS: ok, keine Code-Änderung. Bei fehlender RLS: Migration mit Policies + GRANTs.

## S6 — Storage-Buckets `floor-plans` / `floor-3d-models` privat
**Problem:** Buckets sind `public=true` ohne Pfad-RLS → Grundrisse via direkte URL ohne Login abrufbar.
**Fix:**
- Beide Buckets auf `public=false` umstellen (`storage_update_bucket`).
- RLS-Policies auf `storage.objects` schreiben: Lesen/Schreiben nur wenn `split_part(name, '/', 1)::uuid = tenant_id` des Users (gemäß Storage-RLS-Memory).
- Im Frontend signed URLs statt public URLs nutzen, wo die Buckets eingebunden sind (Floorplan-Viewer, 3D-Viewer).

## S7 — `node_metrics` RLS einschränken
**Problem:** SELECT-Policy erlaubt allen Authenticated → Infra-Metriken anderer Tenants einsehbar.
**Fix:**
- Migration: bestehende Policy droppen, neue Policy nur für Super-Admins (`has_role(auth.uid(), 'super_admin')`).
- GRANTs prüfen (nur `authenticated` + `service_role`).

## Reihenfolge & Verifikation
1. S6 + S7 (Migration + Storage) zuerst — DB-/Storage-Änderungen.
2. S1, S2, S4 (Edge Functions) parallel.
3. S3, S5 (Frontend + RLS-Check).
4. Nach jedem Schritt: kurzer Smoke-Test (z. B. unauth Call auf `charge-point-auto-reboot` → 401, Public-URL auf Floorplan → 400/403, Cross-Tenant-Query auf `node_metrics` → leer).

## Nicht enthalten
- Keine Feature-Erweiterungen (kommen ab Welle 2+).
- Keine UI-Redesigns.
- Keine Performance-Optimierungen (Welle 5).

## Welle 2 — Status (umgesetzt)
- A1: `must_change_password` Flag + `MustChangePasswordGuard` (App.tsx) + invite-tenant-admin setzt user_metadata
- A2: Migration tenants.status/suspended_at/suspended_reason/deleted_at + Validation-Trigger; `useTenants` (suspend/reactivate/softDelete); `TenantLifecycleActions` + Status-Badge in SuperAdminTenants; `TenantStatusGuard` blockt gesperrte/gelöschte Mandanten
- A3: SuperAdminLicenses Create/Edit/Cancel via `LicenseDialog`
- A5: SuperAdminUsers — Plattform-Badge + erklärende Subline (strikte Trennung war bereits implementiert)

Offen: A4 (Audit-Log) — separater Schritt.
