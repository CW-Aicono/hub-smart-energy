# Energy Sharing – Restliche Wiring-Schritte (Phase 1)

Drei kleine, isolierte Änderungen, damit das bereits gebaute Modul für Tenants erreichbar wird.

## 1. Route registrieren
`src/App.tsx`: Route `/energy-sharing` ergänzen, die `EnergySharing`-Page einbinden (lazy import analog zu den übrigen Modul-Seiten), eingebettet in den bestehenden Auth-/Layout-Wrapper.

## 2. Sidebar-Eintrag
`src/components/DashboardSidebar.tsx`: Neuer Menüpunkt „Energy Sharing“ (Icon `Share2` oder `Users`, Label aus `t('nav.energySharing')`), platziert in der passenden Gruppe (Energie/Module). Aktiv-Status via bestehender `NavLink`-Logik.

## 3. ModuleGuard-Mapping
`src/hooks/useModuleGuard.tsx`: Mapping `'/energy-sharing' → 'energy_sharing'` hinzufügen, damit der Eintrag nur sichtbar/erreichbar ist, wenn das Modul für den Tenant aktiviert wurde (Eintrag in `module_prices` existiert bereits aus Migration).

## Technische Details
- Keine DB-Änderungen, keine neuen Komponenten.
- Keine Anpassungen an Super-Admin-Bereich (Modul ist Tenant-scoped).
- i18n-Key `nav.energySharing` ist bereits vorhanden.

## Out of Scope
- Phase 2 (Allocator/Billing Edge Functions)
- Subdomain-Routing (`kluub.de`, `mein.kluub.de`)
- Member-PWA / Marketplace
