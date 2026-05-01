# Plan: Supabase Linter-Warnings beheben

Der Linter meldet **97 Issues** (alle SECURITY-Kategorie). Sie verteilen sich auf 6 Klassen. Code im React-Frontend ist nicht betroffen — alle Findings liegen in der Datenbank/Storage.

## Übersicht der Findings

| # | Klasse | Anzahl | Betroffen |
|---|---|---|---|
| 1 | RLS Enabled, No Policy | 2 | `charging_invoice_counter`, `gateway_refresh_locks` |
| 2 | Function Search Path Mutable | 1 | `public.get_meter_daily_totals_split` |
| 3 | RLS Policy "Always True" (non-SELECT) | 3 | Service-Role-Policies auf `backup_snapshots`, `invite_tokens`, `spot_prices`, `integration_errors`, `infrastructure_metrics`, `charging_access_log`, `charge_point_active_profile` (8 Policies, der Linter zählt 3 repräsentativ) |
| 4 | Public Bucket Allows Listing | 1 | `charging-invoice-assets` (Bucket public + offene SELECT-Policy) |
| 5 | Public Can Execute SECURITY DEFINER | ~32 | Alle SD-Funktionen, die `anon` aufrufen darf |
| 6 | Authenticated Can Execute SECURITY DEFINER | ~58 | Alle SD-Funktionen, die jeder eingeloggte User aufrufen darf |

## Bewertung & Empfehlung pro Klasse

### 1) RLS ohne Policy (FIX — einfach)
- `charging_invoice_counter` und `gateway_refresh_locks` sind interne Tabellen, die nur von Edge Functions / Triggern (Service Role) geschrieben werden. Service Role umgeht RLS sowieso. **Fix:** explizite "deny all" Policy für `authenticated`/`anon` ergänzen, damit der Linter zufrieden ist und die Intention dokumentiert ist.

### 2) Function Search Path (FIX — Pflicht)
- `get_meter_daily_totals_split` hat kein `SET search_path`. **Fix:** `ALTER FUNCTION ... SET search_path = public;` ergänzen.

### 3) RLS Policy "Always True" für Service-Role (FIX durch Einschränkung)
- Diese Policies stammen aus älteren Migrationen, als wir Service-Role-Zugriff per RLS-Policy erlaubt haben. Service Role umgeht RLS bereits per Default → die Policies sind funktional überflüssig und nur noch Lärm.
- **Fix:** Die 8 betroffenen Policies droppen. Service-Role-Zugriff bleibt voll erhalten (Bypass), authentifizierte User haben weiterhin keinen Zugriff (kein anderer Policy-Match → Default-Deny).
- Tabellen, die parallel User-Lese-Policies haben (z. B. `integration_errors`, `charging_access_log`), bleiben für User unverändert lesbar.

### 4) Public Bucket Listing (FIX — wichtig)
- `charging-invoice-assets` ist `public=true` und hat eine `SELECT bucket_id='charging-invoice-assets'`-Policy → jeder kann **alle** Rechnungs-Assets listen. Das ist eine echte Lücke.
- **Fix-Optionen:**
  - **A (empfohlen):** Bucket auf `public=false` setzen + SELECT-Policy auf Tenant-scope einschränken (analog zu `floor-plans`). Frontend nutzt dann signierte URLs (`createSignedUrl`).
  - B: Public lassen, aber Pfad-Konvention erzwingen und Listing per Edge-Function abschalten — nicht möglich in Storage RLS, daher A.
- `floor-plans` und `floor-3d-models` sind ebenfalls `public=true`, haben aber bereits Tenant-scoped SELECT-Policies. Sie sollten zur Konsistenz ebenfalls auf `public=false` gestellt werden, damit die Tenant-Policy auch wirklich greift (sonst kann jeder mit der URL die Datei abrufen). Frontend-Anpassung: signierte URLs statt `getPublicUrl`.

### 5 + 6) SECURITY DEFINER Functions ausführbar von anon/authenticated (FIX — selektiv)
Der Linter empfiehlt hier konservativ, `EXECUTE` zu entziehen. In unserem Code rufen wir die Funktionen aber bewusst aus React/Edge auf. Wir gehen pro Funktion durch und entscheiden:

- **Bleibt ausführbar für `authenticated`** (interner Daten-Zugriff durch RLS-Logik kontrolliert):
  `has_role`, `has_permission`, `has_location_access`, `is_own_profile`, `get_user_tenant_id`, `get_auth_user_email`, `get_location_main_meter`, `get_meter_daily_totals*`, `get_meter_period_sums`, `get_power_readings_5min`, `get_pv_*`, `get_charge_point_uptime_pct`, `next_charging_invoice_number`, `generate_app_tag` — diese sind tenant-aware und werden vom Frontend benötigt. **Maßnahme:** keine Änderung, aber explizit dokumentieren (Kommentar in Migration), damit künftige Linter-Runs als "akzeptiert" gelten.
- **EXECUTE entziehen für `anon` und `authenticated`** (reine Trigger-/Cron-/Edge-Helfer, niemals direkt vom Client gerufen):
  `aggregate_pv_actual_hourly`, `auto_resolve_integration_errors_on_sync_success`, `bootstrap_user_role`, `check_main_meter_no_parent`, `check_meter_hierarchy`, `cleanup_*` (4 Funktionen), `collect_db_metrics`, `compact_power_readings_day`, `compute_daily_totals_from_5min`, `create_task_for_integration_error`, `enforce_simulator_instance_limit`, `ensure_at_least_one_admin`, `ensure_single_main_location`, `guard_privileged_roles`, `handle_new_user`, `handle_new_user_role`, `log_user_role_change` und weitere Trigger-/Cron-only-Funktionen.
  **Fix:** `REVOKE EXECUTE ... FROM anon, authenticated;` — Service Role und Postgres-Owner können sie weiterhin aufrufen (Cron, Trigger).
- **Reduziert das Linter-Volumen um ~70 %** (nur noch die wirklich client-callable Funktionen erscheinen, die akzeptierbar sind).

## Umsetzung — eine konsolidierte Migration

```text
supabase/migrations/<timestamp>_linter_hardening.sql
├─ Block 1: charging_invoice_counter + gateway_refresh_locks
│            → CREATE POLICY "Deny client access" ... USING (false)
├─ Block 2: ALTER FUNCTION get_meter_daily_totals_split SET search_path=public
├─ Block 3: DROP POLICY für die 8 redundanten "Service role"-Policies
├─ Block 4: storage.buckets UPDATE public=false für die 3 Buckets
│           + DROP "Anyone can view invoice assets" Policy
│           + CREATE Tenant-scoped SELECT-Policy für charging-invoice-assets
└─ Block 5: REVOKE EXECUTE ... FROM anon, authenticated
            für die ~25 Trigger-/Cron-only Funktionen (Liste oben)
```

## Frontend-/Edge-Anpassungen

Nur durch Änderung 4 (Storage Buckets) nötig:

- `src/lib/generateChargingInvoicePdf.ts` (und ggf. `ChargingBilling.tsx`): von `getPublicUrl` auf `createSignedUrl(path, 3600)` umstellen für Logo/Briefkopf-Assets.
- `src/components/locations/*` (Floor-Plans/3D-Models): bereits an Stellen, an denen `getPublicUrl` genutzt wird, auf signierte URLs umstellen. Vorher: alle Aufrufe per `rg "from\\('floor-plans'\\)|from\\('floor-3d-models'\\)|from\\('charging-invoice-assets'\\)"` auflisten und gezielt anpassen.

## Verifikation

1. Migration anwenden.
2. `supabase--linter` erneut ausführen → Ziel: < 10 Restwarnungen (nur die bewusst akzeptierten client-callable SD-Funktionen).
3. Smoke-Tests in der App:
   - Ladepunkt-Detail (RFID-Lesemodus)
   - Floor-Plan anzeigen (Liegenschafts-Detail)
   - Charging-Invoice PDF generieren
   - Cron/Trigger laufen weiter (DB-Metriken, OCPP-Cleanup)

## Aufwand & Risiko

- **Aufwand:** 1 Migration (~150 Zeilen SQL) + 2-3 Frontend-Patches für signierte URLs.
- **Risiko:** Mittel — Storage-Bucket-Switch ist die einzige potenziell brechende Änderung. Wird durch Frontend-Anpassung abgefangen. Restliche Änderungen sind reine Härtung ohne Funktionsverlust.
