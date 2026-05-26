# Plan: Remote-Support funktionsfähig machen

## Problem

Der „Remote-Support"-Button im Super-Admin (Mandanten-Detailseite) startet aktuell **keinerlei Session**. Er zeigt nur einen Toast (`SuperAdminTenantDetail.tsx`, Zeile 361–369). Es passiert:
- Keine Eintragung in `support_sessions`
- Keine Weiterleitung in den Mandanten-Bereich (Tenant-Dashboard)
- Kein Banner beim Tenant, weil keine Session existiert und Tenant-Nutzer per RLS gar nicht auf `support_sessions` lesen dürfen

Banner-Komponente (`SupportSessionBanner`) und Hook (`useSupportSession`) sind bereits vorhanden und global in `App.tsx` eingebunden – sie haben nur nichts zum Anzeigen.

## Ziel

1. Klick auf „Remote-Support" startet eine echte Session und öffnet die Mandanten-Sicht (Dashboard des Tenants) im Namen des Super-Admins.
2. Beim Tenant erscheint ein deutlich sichtbares Banner („Remote-Support aktiv – Super-Admin schaut zu") solange die Session läuft.
3. Beenden über einen Button im Banner / Super-Admin-Topbar setzt `ended_at`, Banner verschwindet beim Tenant in Echtzeit, Super-Admin kehrt in den Super-Admin-Bereich zurück.

## Lösung

### 1. Session-Start (Super-Admin)

Aus `SuperAdminTenantDetail.tsx` den Remote-Support-Button erweitern:
- Vorbedingung: `tenant.remote_support_enabled === true`
- INSERT in `support_sessions`:
  - `tenant_id`, `super_admin_user_id = auth.uid()`
  - `started_at = now()`, `expires_at = now() + 15 min`
  - `reason = 'Remote-Support Sitzung'`
- Erfolgreiche ID + Tenant-ID in `sessionStorage` ablegen:
  - `support_view.tenant_id`
  - `support_view.session_id`
- Navigation auf `/` (Tenant-Dashboard).
- Wenn schon eine aktive Session für diesen Tenant existiert (nicht beendet, nicht abgelaufen): diese wiederverwenden statt neu anzulegen.

### 2. Impersonation / „View as Tenant"

Neuer Context `SupportViewContext` (oder Erweiterung von `useTenant`):
- Liest beim Mount `sessionStorage.support_view.tenant_id`.
- Wenn gesetzt **und** aktueller User ist `super_admin`: `useTenant` lädt diesen Tenant statt des eigenen Profil-Tenants. Alle bestehenden Queries (`.eq("tenant_id", tenant.id)`) funktionieren dadurch automatisch im Kontext des Ziel-Tenants, weil super_admin per RLS ohnehin alles lesen darf.
- Validierung: Server-seitig prüfen via select auf `support_sessions` (nicht beendet, nicht abgelaufen). Wenn ungültig → sessionStorage leeren, zurück nach `/super-admin/tenants/:id`.

### 3. Banner für den Tenant

Aktuell darf nur `super_admin` `support_sessions` lesen. Damit der Tenant das Banner sieht, muss eine zusätzliche RLS-SELECT-Policy her:

```sql
CREATE POLICY "Tenant members can view own active support sessions"
  ON public.support_sessions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );
```

`GRANT SELECT ON public.support_sessions TO authenticated` ergänzen (bisher nur service_role/super_admin via Policy).

Banner (`SupportSessionBanner`) bleibt inhaltlich. Anpassungen:
- Texte auf Tenant-Sicht zugeschnitten („Ein Mitarbeiter des Supports ist aktuell in Ihrem Konto eingeloggt.").
- Wird durch das bestehende Realtime-Subscribe in `useSupportSession` automatisch ein- und ausgeblendet (wenn `ended_at IS NOT NULL` → Query liefert null → Banner verschwindet).
- Banner soll auch im Super-Admin-Impersonation-Modus sichtbar sein (zur visuellen Bestätigung, dass man „live im Tenant" ist) – ist es per App.tsx bereits.

### 4. Session beenden

Zwei Wege, beide aktualisieren `support_sessions.ended_at = now()`:

a) **Super-Admin Topbar im Impersonation-Modus**: Eine dauerhaft sichtbare Leiste am oberen Rand zeigt „Sie sehen [Tenant-Name] als Super-Admin – [Remote-Support beenden]". Beim Klick:
   - UPDATE `support_sessions` → `ended_at = now()`
   - sessionStorage leeren
   - Navigation auf `/super-admin/tenants/:id`

b) Banner-„Beenden"-Button für den Super-Admin nicht nötig (Topbar reicht). Tenant darf nicht beenden.

Realtime auf `support_sessions` ist bereits aktiv – der Banner beim Tenant verschwindet automatisch innerhalb von Sekunden.

### 5. Anzeige im Super-Admin-Button

Button „Remote-Support" auf der Mandanten-Seite zeigt zusätzlich:
- Wenn aktive Session für diesen Tenant existiert: Label „Sitzung fortsetzen" + „Beenden"-Sekundärbutton.
- Sonst: „Remote-Support starten" (wenn `remote_support_enabled`), sonst disabled.

## Technische Details

Geänderte / neue Dateien:
- `src/pages/SuperAdminTenantDetail.tsx` – Button-Logik (Start / Fortsetzen / Beenden + Navigation)
- `src/hooks/useTenant.tsx` – Support-View Override (Super-Admin + sessionStorage)
- `src/hooks/useSupportSession.tsx` – kleine Erweiterung: `endSession()` Methode
- `src/components/SupportSessionBanner.tsx` – Tenant-zugeschnittener Text, optional „Beenden" nur für Super-Admin
- `src/components/SuperAdminImpersonationBar.tsx` (neu) – persistente Top-Leiste im Tenant-Layout wenn Impersonation aktiv
- `src/App.tsx` – `SuperAdminImpersonationBar` einbinden
- Neue Migration:
  - SELECT-Policy für Tenant-Mitglieder auf `support_sessions`
  - `GRANT SELECT ON public.support_sessions TO authenticated`
  - UPDATE-Policy für Super-Admin (für `ended_at`) – bereits via FOR ALL vorhanden, prüfen.

i18n: neue Schlüssel `support_banner.tenant_view_active`, `support_view.exit`, `tenant_detail.remote_support_start`, `tenant_detail.remote_support_resume`, `tenant_detail.remote_support_end` in DE/EN/ES/NL.

## Out of Scope

- Keine Änderungen an Abrechnungslogik (`upsertSupportInvoiceEntry`) – das bestehende Modell pro 15-Minuten-Block bleibt.
- Kein echter Identitätswechsel auf Auth-Ebene (kein Token-Swap). Super-Admin bleibt `super_admin` – die RLS deckt Lesen/Schreiben im Tenant-Kontext bereits ab. Falls später strikte Audit-Trennung nötig: separates Edge-Function-Token (nicht jetzt).
