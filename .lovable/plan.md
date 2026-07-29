## Analyse-Studio als eigenständiges Modul

Das Analytics Studio wird zu einem vollwertigen, kostenpflichtigen Modul – analog zu Ladeinfrastruktur, Aufgabenverwaltung etc. – mit Freischaltung pro Tenant im Super-Admin.

### 1. Modul-Registrierung

`**src/hooks/useTenantModules.tsx**` – neuen Eintrag in `ALL_MODULES` ergänzen:

```
{ code: "analytics_studio", label: "Analyse-Studio" }
```

`**src/hooks/useModuleGuard.tsx**` – Route + Nav-Eintrag registrieren:

```
"/analytics-studio": "analytics_studio"
```

in `ROUTE_MODULE_MAP` und `NAV_MODULE_MAP`.

### 2. Route absichern

In `src/App.tsx` (oder wo die Route definiert ist) den `<AnalyticsStudio />` in `<ModuleGuard>` wickeln – identisch zum Muster der anderen Modul-Routen. Der Sidebar-Link wird durch `isNavItemVisible` automatisch ausgeblendet, sobald das Modul deaktiviert ist.

### 3. Preis-Konfiguration

Migration für `module_prices`: einen Datensatz für `analytics_studio` mit Default-Preisen einfügen (Standard, Industrie, Partner, Partner-Industrie – analog zu bestehenden Modulen). Vorschlag: **29 €/Monat Standard**, **49 €/Monat Industrie**, Partner-Preise als Nullwerte (vom Super-Admin einstellbar). Preise sind später in `SuperAdminModulePricing` frei anpassbar.

### 4. Default-Freischaltung

Keine automatische Aktivierung. Bestehende Nutzer, die das Studio derzeit sehen, verlieren den Zugriff, bis der Super-Admin es freischaltet (konsistent mit "strict mode" – sobald `tenant_modules`-Einträge existieren, ist alles Nicht-Aufgeführte gesperrt).

**Optional** (bitte bestätigen): Für alle bestehenden Tenants, die schon `analytics_workspaces` angelegt haben, per Migration `tenant_modules(analytics_studio, is_enabled=true)` einfügen, damit aktive Nutzer nicht plötzlich ausgesperrt werden.

### 5. Super-Admin UI

Keine Änderungen nötig – `SuperAdminLicenses` und `SuperAdminModulePricing` iterieren über `ALL_MODULES` und `module_prices` und rendern den neuen Eintrag automatisch.

### Technische Details

- Kein DB-Schema-Change an `analytics_workspaces` etc. – nur zwei neue Datensätze (`module_prices` + optional `tenant_modules` Backfill).
- I18n-Label für `analytics_studio` in DE/EN/ES/NL ergänzen.

### Offene Frage

Sollen bestehende Tenants mit vorhandenen Analytics-Workspaces automatisch freigeschaltet werden (Punkt 4 „Optional"), oder soll jeder Tenant aktiv vom Super-Admin freigegeben werden?  
  
Antwort: Ja, bestehende Tenants sollen für das Analyse-Studio freigeschaltet werden  
  
  
  
  