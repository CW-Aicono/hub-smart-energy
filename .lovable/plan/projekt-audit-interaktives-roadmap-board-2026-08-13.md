# Projekt-Audit + interaktives Roadmap-Board

## Teil 1: Wo das Projekt heute steht (geprüfter Stand)

Umfang laut Code: 93 Seiten, 130 Edge Functions, 68 Dateien mit Tests, 24 archivierte Pläne.

**Fertig und im Betrieb**
- Multi-Tenancy mit RLS, Super-Admin strikt getrennt, Rollen/Rechte, Support-Sitzungen (Impersonation)
- Energiedaten: 5-Min/Stunden-Reihen, Perioden-Summen, Partitionierung, PV-Prognose (Open-Meteo), Sankey/Analytics Studio
- Gateways: Loxone-WS-Worker (v1.18), AICONO EMS Add-on, MQTT-Bridge, Shelly, Schneider, Siemens
- E-Mobilität: OCPP-1.6-Dauerserver, Ladepunkte, Abrechnung, PV-Überschussladen, Super-Admin-Gesamtübersicht aller Ladepunkte
- Gebäudeautomation inkl. lokaler Ausführung und Cloud-Fallback
- Dokumentenmodul (Tabellen `documents`, `document_versions`, `document_links`, `document_categories`, `document_access_rules`) inkl. Upload-Dialog, Panel und Badges
- Module/Preise/Bundles, Partner-Portal, Sales, Board-PWA, 4 Sprachen

**Offen aus laufenden Plänen (nicht abgeschlossen)**
- Impulszähler: Worker v1.18 ist im Repo, aber **Hetzner-Deploy und Altdaten-Bereinigung (30 Tage) stehen noch aus**; Hinweis-Badge in der State-Zuordnung fehlt noch
- Multi-Location-Automation: Loxone-Templates standortübergreifend – Restarbeiten
- Dokumentenmodul: eigener Preis/Modul-Eintrag und Rollen-Feinschliff prüfen
- Einheitliches Tabellenmuster (Namensklick = Bearbeiten, Drei-Punkte-Menü): Tenant-Ebene weitgehend umgestellt, Super-Admin-Listen noch nicht durchgängig

**Wiederkehrende Schleifen (mehrfach dasselbe Thema)**
1. „Backend down / kein Login" – mindestens 5 Runden (IO-Budget, Verbindungspool, Cron-Sättigung). Behoben jeweils per Neustart + Entlastung, aber ohne dauerhafte Absicherung/Frühwarnung.
2. Verlaufsgraphen falsch (Zacken, Nadeln, Peaks, Einbrüche) – ca. 6 Runden zu Rollen-Mapping, Backfill, Impulszählern, Maßeinheiten.
3. Hetzner-Deploy scheitert – 5 Runden (Waisen-Datensätze, Cron-Job-IDs, Migrationsreihenfolge).
4. Maßeinheiten Gas/Wasser (m³ vs. kWh) – mehrfach nachgebessert.
5. Anmelden/Onboarding/Datenanlage wurden nur punktuell und manuell geprüft – es gibt **keinen automatisierten Durchlauf**, der diese Kernpfade nach jedem Deploy testet.

## Teil 2: Empfehlung – wo die Liste lebt

**In der App, im Super-Admin, als neuer Bereich „Roadmap".** Gründe: Du arbeitest ohnehin täglich dort, die Liste bleibt bei Projektleiterwechsel erhalten, sie kann direkt auf Mandanten/Ladepunkte/Standorte verlinken, und Statusfelder lassen sich später automatisch aus Health-Checks füllen. Das bestehende Tenant-Modul „Aufgaben" ist bewusst kundenbezogen und wird **nicht** vermischt (Trennungsregel Super-Admin/Tenant).

Nicht empfohlen: externes Tool (Notion/Jira) – doppelte Pflege, kein Bezug zu Live-Daten.

## Teil 3: Was gebaut wird

**Neue Super-Admin-Seite „Roadmap"** (`/super-admin/roadmap`) mit:
- Kanban-Ansicht (Backlog / Als Nächstes / In Arbeit / Prüfung / Erledigt) und alternativ Listenansicht
- Priorisierung per Drag & Drop plus Score: Wirkung (1-5), Aufwand (1-5), Risiko (1-5) → automatischer Rang; Schnellfilter „Stabilität", „Datenqualität", „Feature", „Technische Schuld"
- Felder je Eintrag: Titel, Beschreibung, Kategorie, Priorität, Status, Verantwortlich, Fälligkeit, Verweis auf Plan-Dokument, Verlinkung zu Mandant/Standort
- Historie je Eintrag (wer hat wann was geändert) – wichtig für die Übergabe
- Startbefüllung mit den unten stehenden Einträgen aus dem Audit

**Vorgeschlagene Startliste (priorisiert)**

Priorität 1 – Stabilität:
1. Dauerhafte Absicherung gegen „Backend down": Lastwächter, Alarm bei Verbindungspool-/IO-Sättigung, automatische Drosselung statt manuellem Neustart
2. Automatischer Rauchtest nach jedem Deploy: Anmelden, Onboarding-Wizard, Standort anlegen, Zähler anlegen, Dashboard lädt Werte, Ladepunkt sichtbar
3. Hetzner-Deploy stabilisieren: Vorabprüfung als fester Schritt in der Pipeline statt Nachbesserung im Fehlerfall

Priorität 2 – Datenqualität:
4. Impulszähler-Rollout abschließen (Worker-Deploy, Altdaten-Bereinigung, Hinweis-Badge)
5. Einheiten-Prüfung als Dauertest (Gas/Wasser m³ ↔ kWh) in allen Kacheln und Exporten
6. Plausibilitäts-Wächter für Messreihen: Ausreißer und Nullwerte automatisch markieren statt manuell suchen

Priorität 3 – Produktreife:
7. Dokumentenmodul: Preis/Modul-Schalter und Rollenmatrix fertigstellen
8. Multi-Location-Automation mit Loxone-Templates abschließen
9. Einheitliches Tabellenmuster im Super-Admin nachziehen
10. Onboarding-Strecke für Neukunden end-to-end testen und vereinfachen

## Technische Details

- Migration: `roadmap_items` (Titel, Beschreibung, Kategorie, Status, Wirkung/Aufwand/Risiko, Rang, Verantwortlicher, Fälligkeit, Plan-Referenz, optional `tenant_id`), `roadmap_item_history`; Zugriff ausschließlich für Super-Admins über `has_role`, inkl. GRANTs; `updated_at`-Trigger
- Frontend: `src/pages/SuperAdminRoadmap.tsx`, Komponenten unter `src/components/super-admin/roadmap/`, Hook `useRoadmapItems`; Sidebar-Eintrag in `SuperAdminSidebar.tsx`, Route in `App.tsx`
- Wiederverwendung: Kartenlayout und Detail-Sheet analog `TaskCard`/`TaskDetailSheet`, Tabellenmuster über `row-actions.tsx`, Zahlen im deutschen Format
- Startbefüllung als Datenmigration, damit der Stand bei jedem Umzug (Lovable/Hetzner) mitkommt
- Rauchtest (Punkt 2) wird als eigener Folgeschritt geplant, nicht in diesem Umsetzungspaket
