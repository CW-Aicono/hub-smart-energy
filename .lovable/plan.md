# C-Level Dashboard — neues Modul (überarbeitet)

Ein eigenes, schlankes Management-Cockpit für C-Level. Eigene PWA unter `board.aicono.org`, vom Super-Admin pro Tenant freischaltbar, Zugang über frei konfigurierbare Rollen, Templates (CEO/CFO/CTO/ESG), individuell anpassbar, mit drei mitgelieferten Themes und freier Theme-Erstellung durch den Tenant-Admin.

---

## 1. Was die Nutzer bekommen

**Eine eigene App** unter `board.aicono.org` — installierbar auf Smartphone und Tablet wie eine native App. Login mit den bekannten EMS-Zugangsdaten. Wer keine Berechtigung „C-Level-Dashboard öffnen" hat, kommt nicht rein.

**Sofort nach dem Login** sehen die Nutzer:
- Persönliche Begrüßung
- Eine große Headline-Kachel (z. B. „Heute 1.243 € verbraucht — 12 % weniger als gestern")
- 6–12 große, lesbare Kacheln im Bento-Grid (eine groß, der Rest drumherum)
- Zeitbereichs-Umschalter oben: **Heute / Woche / Monat / Jahr**
- Tab-Bar unten (Mobil) bzw. Seitenleiste (Tablet): **Übersicht · Standorte · ESG · Einstellungen**

**Templates** beim ersten Start, jederzeit umschaltbar:
- **CEO**: Gesamtkosten, CO₂, Top/Flop-Standort, kritische Alerts, Forecast Monatsende
- **CFO**: Kosten heute/Monat/YTD, € pro Standort, Einsparung vs. Vorjahr, Ladeumsatz, Trading-P&L, offene Rechnungen
- **CTO/COO**: Verfügbarkeit Gateways, Autarkie, PV-Performance, offene Tasks, Ladepunkt-Stabilität
- **ESG**: CO₂-Bilanz, Eigenverbrauchsquote, PV-Ertrag, vermiedene Tonnen, ESG-Score

**Individualisierung** über Stift-Icon: Kacheln ein/aus, neu anordnen (Drag & Drop), Größe wechseln (S/M/L). Speicherung pro User.

---

## 2. Design

**Grundprinzip: elegant, modern, reduziert.** Wenig Farben, viel Whitespace, große Typografie, sanfte Schatten, klare Hierarchie. Animationen dezent (framer-motion, kurze Fade/Slide-Transitions).

**Drei mitgelieferte System-Themes** (jeweils Light & Dark-Variante):
1. **Executive** — neutrales Graphit + einzelner Akzent in AICONO-Blau
2. **Editorial** — Off-White / Anthrazit, ein warmer Akzent (Bernstein)
3. **Boardroom** — tiefes Dunkelgrau + dezenter Gold-Akzent, ESG-Grün als Sekundär

**Theme-Modus**: Umschalter in den App-Einstellungen mit drei Optionen: **Hell · Dunkel · System** (folgt OS-Einstellung). Pro User gespeichert.

**Eigene Themes** kann der Tenant-Admin im EMS unter „Einstellungen → C-Level Dashboard" anlegen (Name + 4 Farben: Hintergrund, Karte, Akzent, Erfolg — jeweils für Light & Dark).

---

## 3. Platzierung & Zugang

- **Eigene Subdomain**: `board.aicono.org`, PWA-installierbar (eigenes Manifest, eigene Icons)
- **Im normalen EMS**: dezenter Link „C-Level-Dashboard öffnen" im User-Menü, sichtbar nur wenn Modul aktiv und Berechtigung vorhanden
- **Im Super-Admin-Menü**: neuer Punkt **„C-Level Dashboard" direkt unter „Benutzerverwaltung"** — dort sieht der Super-Admin pro Tenant ob das Modul aktiv ist, kann es ein-/ausschalten und globale System-Themes pflegen
- **Im Tenant-Admin-Menü** unter „Einstellungen": neuer Bereich „C-Level Dashboard" für Theme-Verwaltung und Übersicht der berechtigten User

---

## 4. Berechtigungssystem (per Rolle, nicht hart)

Statt einer festen Rolle `c_level`:
- Neue **Permission** `board.access` wird ins bestehende Permissions-System eingeführt
- Der Tenant-Admin kann unter „Rollen & Berechtigungen" beliebige eigene Rollen anlegen (z. B. „Geschäftsführung", „Beirat", „Finanzleitung") und dort die Berechtigung `board.access` aktivieren
- Jede Person mit einer Rolle, die `board.access` enthält, kann sich auf `board.aicono.org` einloggen
- Modul `c_level_dashboard` muss vom Super-Admin für den Tenant aktiv sein, sonst greift die Berechtigung nicht
- Vorteil: voll flexibel, passt sich an Kundenstruktur an, nutzt das vorhandene Rollensystem

---

## 5. Kachel-Katalog (alle optional)

**Energie & Kosten**
- Kosten heute / Woche / Monat / YTD mit Vorjahresvergleich
- Verbrauch (kWh) mit Mini-Verlaufschart
- Forecast Monatsende
- Einsparung vs. Vorjahr (€ und %)

**Nachhaltigkeit / ESG**
- CO₂-Emissionen heute / Monat / YTD
- Eigenverbrauchsquote
- Autarkiegrad
- PV-Ertrag + vermiedene CO₂-Tonnen

**Portfolio / Standorte**
- Top 3 / Flop 3 Standorte (kWh/m² oder €/m²)
- Standort-Heatmap (Ampel pro Standort)
- Offene kritische Alerts (Zahl + Liste)
- Standort-Karte (optional)

**Ladeinfrastruktur** (nur bei aktivem EV-Modul)
- Umsatz heute / Monat
- Auslastung
- Sessions
- Top-Standort

**Trading** (nur bei aktivem Arbitrage- oder Peak-Shaving-Modul) — NEU
- Arbitrage-P&L heute / Monat / YTD
- Anzahl Trades + Erfolgsquote
- Peak-Shaving Einsparung (€ und kW vermiedene Spitze)
- Aktueller Spot-Preis vs. Tagesdurchschnitt

**Aufgabenverwaltung** — NEU
- Offene Aufgaben gesamt (mit Trend)
- Überfällige Aufgaben (rot, mit Klick zur Liste)
- Aufgaben nach Priorität (klein/mittel/hoch/kritisch)
- Top 3 offene High-Priority-Tasks (als Liste)

Jede Kachel: großer Zahlenwert + Label + Trendpfeil + Vergleichswert. Tap → kompakte Detailansicht innerhalb der PWA (kein Sprung in komplexe EMS-Seiten).

---

## 6. Technische Details

**Frontend**
- Neuer Layout-Wrapper `BoardLayout.tsx` analog `SharingLayout.tsx` / `PartnerLayout.tsx`
- Routes unter `/board/*` mit `BoardHostGuard` für `board.aicono.org`
- Hook `useBoardLayout()` lädt User-Layout aus `board_user_layouts`
- Bento-Grid via CSS Grid + `react-grid-layout` im Anpassen-Modus
- Theme-Provider: Light/Dark/System via `prefers-color-scheme` + User-Override
- PWA-Manifest `public/manifest-board.json` analog zu bestehenden PWAs
- i18n: neue Keys `board.*` in DE/EN/ES/NL

**Backend (Lovable Cloud)**
- Neue Tabellen:
  - `board_themes` (tenant_id nullable, name, colors_light jsonb, colors_dark jsonb, is_system) — 3 System-Themes als Seed mit `tenant_id IS NULL`
  - `board_templates` (code, name, default_layout jsonb) — CEO/CFO/CTO/ESG Seed
  - `board_user_layouts` (user_id, tenant_id, template_code, tiles jsonb, theme_id, theme_mode: 'light'|'dark'|'system')
- Neue **Permission** `board.access` in `permissions` (Seed)
- Modul `c_level_dashboard` in `ALL_MODULES` + Super-Admin-Toggle
- RLS: strict per `tenant_id` + `auth.uid()`; System-Themes für `authenticated` lesbar; `service_role` ALL
- Im `ROUTE_MODULE_MAP` neue Einträge für `/board/*`

**Super-Admin-Bereich**
- Neuer Menüpunkt **„C-Level Dashboard"** in `SuperAdminSidebar` direkt unter „Benutzerverwaltung"
- Neue Seite `SuperAdminBoard.tsx`: Liste aller Tenants mit Status (Modul an/aus), globale System-Themes verwalten, Statistik (wie viele User pro Tenant haben Zugriff)

**Daten-Aggregation**
- KPIs aus bestehenden Tabellen: `meter_period_totals`, `pv_actual_hourly`, `charging_sessions`, `arbitrage_trades`, `peak_shaving_monthly_summary`, `tasks`, `alert_rules`
- Caching pro Kachel: `staleTime: 5min`, `refetchOnWindowFocus: false`
- Teure Aggregationen (Standort-Ranking, Trading-Summen) über Edge Function `board-kpis` mit 1h-Snapshot in `board_kpi_snapshots`
- Alle Zahlen via `toLocaleString("de-DE")`

**Hetzner-Relevanz**
- Migrationen (Tabellen, Permission, Modul-Seed) — vom Hetzner-Programmierer nachzuziehen
- Edge Function `board-kpis` ist **nicht** OCPP-relevant → fällt nicht unter die Hetzner-Manual-Sync-Regel, wird aber in der Phasen-Übergabe explizit erwähnt

---

## 7. Umsetzung in Phasen

**Phase 1 — Fundament**: DB-Migration (3 Tabellen, Permission `board.access`, Modul `c_level_dashboard`, Seed der 3 System-Themes + 4 Templates), Host-Guard, Login-Flow auf `board.aicono.org`

**Phase 2 — Layout & Templates**: BoardLayout, Bento-Grid mit statischen Kacheln, Template-Auswahl, Theme-Picker mit Light/Dark/System

**Phase 3 — Kachel-Katalog**: Alle KPI-Kacheln mit echten Daten (inkl. Trading + Tasks)

**Phase 4 — Anpassen-Modus**: Drag & Drop, Kacheln ein/aus, Größenwechsel, Speichern pro User

**Phase 5 — Tenant-Admin Theme-Verwaltung**: neuer Tab unter Einstellungen, eigene Themes mit Light/Dark anlegen

**Phase 6 — Super-Admin „C-Level Dashboard"-Menüpunkt**: Übersicht aller Tenants, Modul-Toggle, System-Theme-Pflege

**Phase 7 — Polish**: framer-motion-Übergänge, Pull-to-Refresh, Offline-Fallback der letzten KPIs, i18n-Vollständigkeit, Tests

---

## 8. Was bewusst NICHT drin ist

- Keine tiefen Drill-Down-Reports — dafür gibt es das EMS
- Keine Bearbeitung von Daten (read-only Cockpit)
- Keine Push-Notifications in Phase 1
- Keine native iOS/Android-App — PWA reicht

---

Wenn der Plan passt, starte ich mit **Phase 1**: DB-Migration für Modul, Permission, drei Tabellen + Seed der 3 System-Themes und 4 Templates.