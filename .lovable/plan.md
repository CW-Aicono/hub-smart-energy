# Tabellen-Audit & Ergänzungsplan (Super-Admin + Partner-Portal)

## Ziel
Alle Tabellen im Super-Admin- und Partner-Bereich sollen:
1. Eine **Textsuche** über die relevanten Spalten haben (Input oben rechts über der Tabelle, client-seitig gefiltert).
2. **Sortierung auf-/absteigend per Klick auf den Spaltentitel** unterstützen — via bestehender Helper `SortableHead` + `useSortableData` (`src/components/ui/sortable-head.tsx`).

Kleine, rein informative Tabellen (< ~10 Zeilen, feste Länge) bekommen **nur Sortierung**, keine Suche.

## Ist-Zustand (kompakt)

Legende: S = Suche, ↕ = Sortierung. ✅ vorhanden · ❌ fehlt · — nicht sinnvoll.

### Super-Admin
| Datei / Tabelle | S | ↕ | To-do |
|---|---|---|---|
| SuperAdminPartners.tsx – Partner-Liste | ❌ | ❌ | S + ↕ |
| SuperAdminRoles.tsx – SA-User + Rollen (2 Tabellen) | ❌ | ✅ | S (nur SA-User-Tabelle) |
| SuperAdminUsers.tsx – Plattform-User | ✅ | ✅ | — |
| SuperAdminOcppIntegrations.tsx – Charger-Modelle | ❌ | ✅ | S (zusätzlich zu bestehenden Chips) |
| SuperAdminTenants.tsx – Tenants | ✅ | ✅ | — |
| SuperAdminOcppControl.tsx – Ladesessions | ❌ | ✅ | S |
| SuperAdminTenantDetail.tsx – Module, User+Invites, Bundle-Module, Support-Sessions | ❌ | ❌ | S + ↕ (Users, Support); nur ↕ (Module, Bundle) |
| SuperAdminOcppFirmware.tsx – Firmware-Artifacts | ✅ | ✅ | — |
| SuperAdminSupport.tsx – Remote-Support-Sessions | ❌ | ✅ | S |
| SuperAdminSimulators.tsx – Simulator-Instanzen | ❌ | ❌ | S + ↕ |
| SuperAdminLicenses.tsx – Lizenzen | ❌ | ✅ | S |
| SuperAdminBilling.tsx – Tenant-Rechnungen | ❌ | ✅ (lokal) | S |
| SuperAdminSavingsShare.tsx – Gain-Sharing-Verträge | ❌ | ❌ | S + ↕ |
| SuperAdminGatewayFleet.tsx – Fleet, Update-Jobs, Release-Channels (3) | ❌ | ❌ | S + ↕ (Fleet); nur ↕ (Jobs, Channels) |
| savings-share/SavingsShareTab.tsx – Baselines, Settlements | ❌ | ❌ | ↕ (klein) |
| LoxoneMiniserverMonitorCard.tsx (raw `<table>`) | ❌ | ❌ | ↕ |
| LoxonePollingOverviewCard.tsx (raw `<table>`) | ❌ | ❌ | ↕ |
| AlertRulesCard.tsx (raw `<table>`) | ❌ | ❌ | — (sehr klein, fest) |

### Partner-Portal
| Datei / Tabelle | S | ↕ | To-do |
|---|---|---|---|
| partner/PartnerTenants.tsx | ✅ | ✅ | — |
| partner/PartnerMembers.tsx | ❌ | ✅ | S |
| partner/PartnerTenantDetail.tsx – Locations, Lizenzen | ❌ | ❌ | ↕ (beide klein) |
| partner/PartnerBilling.tsx – Commission, Modul-Pricing, Tenant-Margen (3) | ❌ | ✅ | S (nur Commission + Margen) |
| partner/PartnerSavingsShare.tsx – Verträge, Settlements | ❌ | ❌ | S + ↕ |

## Vorgehen pro Tabelle

Einheitlich, damit UI konsistent bleibt:

1. **Sortierung**
   - Für shadcn-Tables: `TableHead` → `SortableHead` aus `@/components/ui/sortable-head`, Daten durch `useSortableData(rows, initialKey)` schicken.
   - Für die drei raw `<table>` Monitor-Karten: kleine, lokale Sort-State (`useState<{key,dir}>`), `<th>` mit `cursor-pointer` + kleinem Pfeil-Icon (`ArrowUp/ArrowDown/ArrowUpDown` aus lucide) — kein Umbau auf shadcn, um das schlanke Layout dieser Cards nicht zu ändern.

2. **Suche**
   - Standard-Muster (wie in `SuperAdminTenants.tsx`, `SuperAdminUsers.tsx`, `PartnerTenants.tsx`):
     ```tsx
     const [search, setSearch] = useState("");
     const filtered = useMemo(
       () => rows.filter(r => matches(r, search)),
       [rows, search]
     );
     const { items, requestSort, sortConfig } = useSortableData(filtered, defaultKey);
     ```
   - Suchfeld: `<Input placeholder="Suchen..." />` (mit `Search`-Icon) rechts oberhalb der Tabelle bzw. neben bestehenden Filter-Selects.
   - `matches` deckt die sinnvollen Textspalten ab (Name, Slug, Email, Location, Status-Label, …); Zahlen/Beträge/Datumsspalten werden nur formatiert-verglichen wenn sinnvoll.

3. **Konsistenz**
   - Kein Server-Roundtrip: alles clientseitig auf den bereits geladenen Rows.
   - Leerzustand: "Keine Treffer für „{search}"" statt der bisherigen "keine Daten"-Meldung, wenn `search` gesetzt ist.
   - `SortableHead` wird bei jeder Tabelle mit einem sinnvollen Default-Sort initialisiert (meist bestehender Server-Sort, damit die Anzeige beim Öffnen unverändert bleibt).
   - Keine Änderungen an Datenquellen, Queries oder RLS — reine Präsentations-Schicht.

## Umsetzung in Batches

Um die Änderung überschaubar zu halten, in vier Commits/Batches:

- **Batch 1 – Super-Admin große Listen:** Partners, Tenants (bereits ok), OcppControl, OcppIntegrations (S), Support, Licenses, Billing, Simulators.
- **Batch 2 – Super-Admin Detail & Gain-Sharing:** SuperAdminTenantDetail (4 Sub-Tabellen), SuperAdminSavingsShare, SavingsShareTab (Baselines + Settlements), SuperAdminRoles (S für SA-User).
- **Batch 3 – Super-Admin Fleet & Monitoring-Cards:** SuperAdminGatewayFleet (Fleet + Jobs + Channels), LoxoneMiniserverMonitorCard, LoxonePollingOverviewCard (nur ↕).
- **Batch 4 – Partner-Portal:** PartnerMembers (S), PartnerTenantDetail (↕), PartnerBilling (S), PartnerSavingsShare (S + ↕).

Nach jedem Batch: `tsgo` Typecheck + kurzer visueller Check im Preview.

## Nicht enthalten
- Keine Server-seitige Pagination — Datenmengen sind für alle betroffenen Tabellen im gezeigten Umfang unkritisch.
- Keine Änderungen an `AlertRulesCard` (feste, minimale Regel-Liste — Sortierung überflüssig).
- Keine Änderungen an Geschäftslogik, Queries oder Berechtigungen.
