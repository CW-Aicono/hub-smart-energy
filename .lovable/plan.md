

# Super-Admin Backend -- Integrierter Plattform-Verwaltungsbereich

## Uebersicht

Aufbau eines vollstaendigen Super-Admin-Bereichs innerhalb des bestehenden Projekts. Dieser Bereich ist komplett getrennt vom Kunden-Frontend und nur fuer euch als Plattformbetreiber sichtbar. Eure Kunden sehen davon nichts.

Der Super-Admin-Bereich umfasst 5 Kernmodule:
1. **Mandanten-Verwaltung** -- Neue Kunden-Systeme anlegen und verwalten
2. **Modul-Freischaltung** -- Einzelne Features pro Kunde aktivieren/deaktivieren
3. **Support-Zugriff** -- Als Kunde einloggen, Logs einsehen
4. **Statistiken** -- Nutzungsdaten, Auslastung, Aktivitaet
5. **Abrechnung** -- Lizenzkosten, Rechnungsgenerierung

## Architektur

Der Super-Admin nutzt eine neue Rolle `super_admin` im bestehenden Rollensystem. Super-Admins sind NICHT an einen Tenant gebunden -- sie sehen alle Tenants. Das bestehende `app_role` Enum wird um `super_admin` erweitert.

```text
+---------------------------+
|     Bestehendes System    |
|  (Tenant-isoliert via RLS)|
+---------------------------+
         |
         v
+---------------------------+
|   Super-Admin Bereich     |
|  /super-admin/...         |
|  Rolle: super_admin       |
|  Sieht ALLE Tenants       |
+---------------------------+
```

## Datenbank-Aenderungen

### 1. Enum erweitern
Das bestehende `app_role` Enum (`admin | user`) wird um `super_admin` erweitert.

### 2. Neue Tabellen

**`tenant_modules`** -- Welche Module ein Tenant freigeschaltet hat
- `id`, `tenant_id` (FK tenants), `module_code` (z.B. "locations", "integrations", "reporting", "3d_viewer"), `is_enabled`, `enabled_at`, `disabled_at`

**`tenant_licenses`** -- Lizenz- und Abrechnungsdaten
- `id`, `tenant_id`, `plan_name`, `price_monthly`, `price_yearly`, `billing_cycle` (monthly/yearly), `valid_from`, `valid_until`, `status` (active/expired/cancelled), `max_users`, `max_locations`

**`tenant_invoices`** -- Generierte Rechnungen
- `id`, `tenant_id`, `invoice_number`, `period_start`, `period_end`, `amount`, `status` (draft/sent/paid/overdue), `pdf_url`, `created_at`

**`platform_statistics`** -- Aggregierte Nutzungsstatistiken
- `id`, `tenant_id`, `metric_type` (logins, api_calls, storage_mb, active_users), `value`, `recorded_at`

**`support_sessions`** -- Protokoll von Support-Zugriffen
- `id`, `super_admin_user_id`, `tenant_id`, `started_at`, `ended_at`, `reason`

### 3. RLS-Policies
Alle neuen Tabellen erhalten RLS-Policies, die nur Nutzer mit der Rolle `super_admin` Zugriff gewaehren. Die bestehende `has_role`-Funktion wird wiederverwendet.

### 4. Bestehende RLS anpassen
Die bestehenden Tenant-Tabellen (tenants, locations, profiles, etc.) benoetigen zusaetzliche SELECT-Policies fuer `super_admin`, damit der Support-Zugriff funktioniert.

## Frontend-Struktur

### Neue Seiten
- `/super-admin` -- Dashboard mit Uebersicht aller Tenants und KPIs
- `/super-admin/tenants` -- Mandanten-Liste mit Anlegen/Bearbeiten
- `/super-admin/tenants/:id` -- Detail-Ansicht eines Mandanten (Module, Lizenz, Nutzer)
- `/super-admin/statistics` -- Plattform-weite Statistiken und Charts
- `/super-admin/billing` -- Rechnungsuebersicht und -generierung
- `/super-admin/support` -- Support-Log und Tenant-Impersonation

### Neue Komponenten
- `src/components/super-admin/SuperAdminSidebar.tsx` -- Eigene Sidebar (getrennt vom Kunden-Sidebar)
- `src/components/super-admin/TenantList.tsx` -- Mandanten-Tabelle mit Suche/Filter
- `src/components/super-admin/CreateTenantDialog.tsx` -- Neuen Mandanten anlegen
- `src/components/super-admin/TenantDetailView.tsx` -- Tabs: Module, Lizenz, Nutzer, Support
- `src/components/super-admin/ModuleToggle.tsx` -- Module ein-/ausschalten
- `src/components/super-admin/LicenseEditor.tsx` -- Lizenz bearbeiten
- `src/components/super-admin/InvoiceList.tsx` -- Rechnungen anzeigen/generieren
- `src/components/super-admin/PlatformStats.tsx` -- Charts mit Recharts
- `src/components/super-admin/SupportAccessButton.tsx` -- "Als Kunde anmelden"

### Hooks
- `src/hooks/useSuperAdmin.tsx` -- Prueft ob Nutzer `super_admin` ist
- `src/hooks/useTenants.tsx` -- Alle Tenants laden (nur fuer Super-Admin)
- `src/hooks/useTenantModules.tsx` -- Module eines Tenants verwalten
- `src/hooks/useTenantLicense.tsx` -- Lizenzdaten verwalten
- `src/hooks/usePlatformStats.tsx` -- Statistiken laden

### Routing
Neue Routes in `App.tsx` -- alle unter `/super-admin/*`. Die Seiten pruefen die `super_admin`-Rolle und leiten normale Nutzer um.

## Modul-Freischaltung (Kundenansicht)

Damit die Modul-Freischaltung Wirkung zeigt, wird ein `useEnabledModules`-Hook erstellt, der die freigeschalteten Module des aktuellen Tenants laedt. Die Navigation und Seiten pruefen dann, ob das jeweilige Modul aktiv ist, und blenden gesperrte Bereiche aus.

Verfuegbare Module:
- `dashboard` (immer aktiv)
- `locations` -- Standortverwaltung
- `integrations` -- Integrationen
- `3d_viewer` -- 3D-Ansichten
- `reporting` -- Berichte
- `floor_plans` -- Etagenplaene
- `energy_monitoring` -- Energiemonitoring

## Support-Zugriff

Der Support-Zugriff funktioniert ueber einen "Tenant-Kontext-Wechsel": Der Super-Admin waehlt einen Tenant aus und sieht dann das System aus dessen Perspektive (read-only oder mit eingeschraenkten Rechten). Dies wird ueber einen temporaeren Kontext im Frontend umgesetzt, nicht ueber echtes Einloggen als Kunde.

## Implementierungsreihenfolge

Da alle Module gleichzeitig gewuenscht sind, wird schrittweise vorgegangen:

1. **Datenbank**: Enum erweitern, alle neuen Tabellen + RLS anlegen
2. **Authentifizierung**: `useSuperAdmin`-Hook, Route-Guards
3. **Super-Admin Layout**: Sidebar, Dashboard-Seite
4. **Mandanten-Verwaltung**: CRUD fuer Tenants mit Erstbenutzer-Anlage
5. **Modul-Freischaltung**: Toggle-UI + `useEnabledModules` im Kundenbereich
6. **Statistiken**: Tabelle + Charts mit Recharts
7. **Abrechnung**: Lizenz-Editor, Rechnungsliste
8. **Support-Zugriff**: Tenant-Kontext-Wechsel + Protokollierung

---

**Hinweis**: Dies ist ein umfangreiches Feature. Die Implementierung wird in mehreren Nachrichten erfolgen, um die Qualitaet sicherzustellen.

