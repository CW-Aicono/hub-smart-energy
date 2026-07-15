
# Modul „Dokumentation"

Ein eigenständiges Modul, mit dem Tenants Dokumente zentral, pro Liegenschaft oder direkt an einzelnen Assets (Zähler, Sensoren/Aktoren, Wallboxen, Gateways, PV/Speicher, Rechnungen) ablegen können. Zugriff über Rolle + Kategorie + optionalen Einzel-Dokument-Override. Versionierung ab MVP.

## 1. Modul-Registrierung (Super-Admin)

- Neuer Modul-Code `documentation` in `ALL_MODULES` (`useTenantModules.tsx`) – Label: „Dokumentation".
- Migration: Eintrag in `module_prices` (Standard/Industrie/Partner) mit sinnvollem Default (z.B. 9 €/Monat) – im Super-Admin über bestehendes Preis-UI editierbar.
- Sichtbarkeit gesteuert über `ModuleGuard`.
- Sales-Katalog: Modul erscheint automatisch im Angebots-Assistenten (nutzt `module_prices`).

## 2. Navigation – kein neuer Hauptmenüpunkt

- Bestehenden Hauptmenüpunkt **„Einstellungen"** in **„Verwaltung"** umbenennen (Sidebar Desktop + Mobile, alle 4 Sprachen: `nav.settings` → neuer Key `nav.administration` bzw. Wert anpassen).
- Neuer Sub-Menüpunkt **„Dokumentation"** unter „Verwaltung" → Route `/documents`.
- Bestehende Kinder von „Einstellungen" (Branding, E-Mail-Templates, Integrationen …) bleiben unverändert, „Dokumentation" wird eingereiht.
- Menüpunkt nur sichtbar, wenn Modul `documentation` aktiv **und** aktueller User Permission `documents.view` hat.

## 3. Datenmodell

Neue Tabellen (`public`-Schema, RLS + GRANTs):

### `document_categories`
Tenant-eigene Kategorien (Seed: „Allgemein", „Bedienungsanleitung", „Foto", „Rechnung", „Netzwerk/IP", „Vertrag", „Zertifikat").
Felder: `tenant_id`, `name`, `slug`, `icon`, `color`, `sort_order`, `is_system`.

### `documents`
Metadatenkopf (eine Zeile pro logischem Dokument):
- `tenant_id`, `category_id`, `title`, `description`, `tags text[]`
- `current_version_id`, `latest_version_no`
- `valid_from`, `valid_until` (für spätere Erinnerungen vorbereitet)
- `created_by`, `updated_by`, Timestamps

### `document_links` (n:m – ein Dokument kann mehreren Geräten/Scopes zugeordnet werden)
- `document_id`, `tenant_id`
- `scope` enum (`tenant`, `location`, `meter`, `charge_point`, `gateway_device`, `energy_storage`, `energy_supplier_invoice`)
- `scope_id uuid` (nullable bei `tenant`)
- `location_id` optional als Denormalisierung für schnelle Standort-Filter
- Unique `(document_id, scope, scope_id)`
- Mind. ein Link pro Dokument (via Trigger geprüft)

### `document_versions`
- `document_id`, `version_no`, `storage_path`, `filename`, `mime_type`, `file_size_bytes`, `file_hash`, `uploaded_by`, `notes`, `created_at`
- Trigger: neuer Insert → `documents.current_version_id`/`latest_version_no` aktualisieren.

### `document_access_rules`
Ein Regelsatz pro Dokument **oder** pro Kategorie (jeweils tenant_id-scoped):
- `tenant_id`, `document_id` **oder** `category_id` (genau einer gesetzt, CHECK)
- `role app_role` **oder** `custom_role_id` (genau einer gesetzt)
- `can_view`, `can_download`, `can_edit`, `can_delete`

Auflösungspriorität (Security-Definer-Funktion `public.can_access_document(user, doc, action)`):
1. Super-Admin → immer erlaubt
2. Rolle mit Permission `documents.manage` → Vollzugriff
3. Dokument-spezifische Regel (Rolle oder custom_role)
4. Kategorie-Regel
5. Fallback: nur Ersteller + Tenant-Admin

### Storage
- Neuer privater Bucket `tenant-documents` (25 MB Limit, MIME-Whitelist: PDF, PNG/JPG/WEBP, Office-Formate, TXT/CSV/JSON, ZIP).
- Pfad: `<tenant_id>/<document_id>/<version_no>_<safeFilename>`.
- Download über bestehende Edge Function `secure-storage-download` (erweitert um Bucket `tenant-documents` + `can_access_document`-Check).

### Permissions (RBAC)
Neue Einträge in `permissions` (Kategorie „documentation"): `documents.view`, `documents.upload`, `documents.edit`, `documents.delete`, `documents.manage_access`, `documents.manage_categories`.

## 4. UI / UX

### Haupt-Route `/documents` (Verwaltung → Dokumentation)
- Kopfzeile: Suchfeld (Titel/Tag/Filename), Filter (Kategorie, Standort, Scope, Datum), Upload-Button.
- Tab-Umschalter: **Alle · Tenant-weit · Standorte · Geräte · Rechnungen**.
- Karten-/Listenansicht mit Miniatur-Preview, Kategorie-Badge, Standort-Badge, Anzahl Verknüpfungen, Version, Ablaufdatum.
- Klick → Detail-Sheet: Beschreibung, Versionen (Download je Version, „Als aktuell setzen", Notiz), Zugriffsregeln, **Verknüpfungen (Scopes hinzufügen/entfernen – Mehrfachauswahl von Geräten)**, Historie.

### Upload-Dialog
- Datei wählen, Kategorie, Titel, Beschreibung, Tags.
- Abschnitt „Verknüpfen mit" – Multi-Select:
  - Tenant-weit (Checkbox)
  - Standorte (Multi-Select)
  - Geräte (Multi-Select mit Typ-Filter: Zähler, Wallbox, Gateway, PV/Speicher, Sensor/Aktor)
  - Optional: Rechnung
- Zugriffsregeln (optional, sonst Kategorie-Defaults).

### Kontextuelle Anzeige direkt an der Gerätekachel
Neue wiederverwendbare Komponente `<DocumentBadge scope="meter" scopeId={id} />`:
- Erscheint auf **Gerätekacheln/Detail-Sheets** von Wallbox, Zähler, Sensor/Aktor, Gateway, PV/Speicher, Location.
- Zeigt Icon + Anzahl der zugeordneten Dokumente (nur die, die der User via `can_access_document` sehen darf).
- Klick → Popover/Sheet „Dokumente zu diesem Gerät" mit Liste (Titel, Kategorie, Version, Download-Button). Ohne View-Recht: Badge wird ausgeblendet. Ohne Download-Recht: Download-Button disabled + Tooltip.
- Zusätzlich `<DocumentsPanel scope=… scopeId=…>` als voller Tab in bestehenden Detailseiten (Location, Meter, Charge-Point, Gateway, Energy-Storage) mit Upload direkt im Kontext (setzt Verknüpfung automatisch).

### Kategorien- & Zugriffsverwaltung
- Unter „Verwaltung → Dokumentation → Einstellungen" (nur `documents.manage_categories`):
  - CRUD Kategorien.
  - Default-Zugriffsregeln pro Kategorie.
- Im Dokument-Detail: Aktion „Zugriff bearbeiten" → Dialog mit Rollen/Custom-Rollen und Häkchen für view/download/edit/delete.

## 5. Backend-Logik

- Hooks (React Query, Tenant-Isolation nach bestehendem Muster):
  - `useDocuments({ scope?, scopeId?, categoryId?, search? })`
  - `useDocumentsForScope(scope, scopeId)` – für Gerätekacheln (leicht/gecached).
  - `useUploadDocument` – SHA-256 Hash, Upload in Bucket, Insert `documents` + `document_versions` + `document_links`.
  - `useAddDocumentVersion`, `useUpdateDocumentLinks`, `useDocumentAccess`.
- Downloads via `secure-storage-download` (erweitert): Super-Admin ODER `public.can_access_document(user_id, doc_id, 'download')`.
- Realtime-Invalidation auf `documents`, `document_versions`, `document_links`.

## 6. Sicherheit

- RLS: `SELECT` über `can_access_document(auth.uid(), id, 'view')`; `INSERT` verlangt `documents.upload` + Tenant-Match; `UPDATE/DELETE` über passende Permission bzw. Regel.
- GRANTs: `SELECT/INSERT/UPDATE/DELETE` für `authenticated`; `ALL` für `service_role`; kein `anon`.
- MIME-Whitelist client- **und** serverseitig (Trigger prüft `mime_type` + Größe).
- Audit-Log (`writeAuditLog`) bei Upload, Delete, Rechteänderung, Link-Änderung, Kategorie-Änderung.

## 7. Umsetzungsschritte

1. **Migration 1** – Enums, Tabellen (`document_categories`, `documents`, `document_versions`, `document_links`, `document_access_rules`), Trigger, `can_access_document`, Grants, RLS, Permissions-Seed, Bucket, Modul-Preis-Eintrag.
2. **Modul-Registrierung** in `useTenantModules.tsx` (Code `documentation`).
3. **Sidebar-Umbenennung** „Einstellungen" → „Verwaltung" (Desktop + Mobile + i18n DE/EN/ES/NL) + Sub-Item „Dokumentation" (`/documents`) unter Verwaltung.
4. **Edge-Function-Erweiterung** `secure-storage-download` für Bucket `tenant-documents`.
5. **Hooks** implementieren.
6. **UI Hauptseite** `/documents` inkl. Upload-Dialog mit Multi-Scope-Verknüpfung.
7. **`<DocumentBadge>`** in Gerätekacheln einbinden (Location-Detail, MeterCard, ChargePointCard, GatewayCard, StorageCard).
8. **`<DocumentsPanel>`-Tab** in den jeweiligen Detailseiten.
9. **Kategorien- & Zugriffs-Settings** unter Dokumentation.
10. **i18n** (DE/EN/ES/NL) & Audit-Log-Einträge.
11. **Tests**: Vitest für Hooks und `can_access_document`-Regeln.

## 8. Bewusste Nicht-Ziele im MVP

- Kein Ablaufdatum-Task/E-Mail-Trigger (Felder vorbereitet, Erinnerungslogik später).
- Keine Volltext-/OCR-Suche (nur Titel, Beschreibung, Tags, Dateiname).
- Keine öffentlichen Freigabe-Links.
- Kein Video/CAD (25 MB, gängige Formate).

## Technischer Anhang

- Enum `document_scope`: `tenant | location | meter | charge_point | gateway_device | energy_storage | energy_supplier_invoice`.
- Funktion `public.can_access_document(_user uuid, _doc uuid, _action text) returns boolean` (SECURITY DEFINER, `search_path=public`).
- Kompatibilität: bestehende `ppa_documents`, `sales_project_attachments`, `task_attachments`, `meter-photos` bleiben unverändert – das neue Modul ergänzt sie.
