# Baustein-Anleitungen: v1 automatisch + Editor + PDF-Download an Integration

## Bereits erledigt
- Bug behoben: `AICO_TITLE_RE` erlaubt jetzt Unterstriche im Typnamen. `PVSurplus_EV` wird ab sofort im **ersten** Stub-Lauf erkannt und mit-generiert.

## Umsetzung — Anleitungen (Hybrid)

### 1. Datenmodell (Migration)
Neue Tabelle `loxone_snippet_manuals` (global, Super-Admin-verwaltet):
- `template_key` (PK, z. B. `AICO_PVSurplus_EV`)
- `title`, `purpose_md`, `wiring_md`, `test_md`, `version`, `updated_at`, `updated_by`
- RLS: Read für alle authentifizierten User, Write nur für `super_admin`
- Seed-Migration füllt für alle 29 Katalog-Einträge:
  - `purpose_md` = Beschreibung + Parameter-Tabelle aus `snippetsCatalog.ts` (automatisch)
  - `wiring_md`, `test_md` = generisches Skelett („1. Baustein in Loxone Config öffnen …", Platzhalter für konkrete Verdrahtung)

### 2. Editor im Super-Admin
Neuer Sub-Tab **Anleitungen** unter `Super-Admin → Loxone-Templates`:
- Liste aller 29 Bausteine mit Status („v1-Skelett" / „bearbeitet")
- Detail-Ansicht mit drei Markdown-Editoren (Zweck / Verdrahtung / Test) + Live-PDF-Vorschau
- Speichern erhöht `version`, setzt `updated_by`

### 3. PDF-Generator
- Client-seitig via `jsPDF` (bereits im Projekt für EV-Rechnungen genutzt) — kein Edge-Function-Call nötig
- Layout: AICONO-CI Header, Titel, drei Abschnitte, Parameter-Tabelle, Footer mit Version + Datum + Baustein-Key
- Dateiname: `AICONO_<TemplateKey>_v<version>.pdf`

### 4. Download-Button an der Integration
- `src/components/integrations/IntegrationCard.tsx` (bzw. die Detailansicht der Miniserver-Integration): pro erkanntem Template-Typ ein Button „📄 Anleitung" neben dem Puzzle-Icon
- Klick → `jsPDF` erzeugt PDF aus `loxone_snippet_manuals`-Eintrag und öffnet Download
- Sichtbar nur, wenn Template auf diesem Miniserver via Discovery gefunden wurde (nur installierte Bausteine)

### 5. Rechte
- Sichtbar für Rollen mit Zugriff auf Integrationen (bestehende Rechte-Prüfung, keine neue Rolle nötig)

## Nicht Teil dieses Plans
- Ablage in Dokumentations-Modul (bewusst weggelassen — laut deiner Wahl nur an Integration).
- Multi-Language: v1 nur Deutsch (Übersetzung später einfach nachrüstbar, Struktur ist vorbereitet).

## Ergebnis für dich
1. Sofort nach dem Deploy: an jedem Miniserver-Baustein (via 🧩 erkannt) erscheint ein 📄-Button → PDF-Download mit v1-Skelett.
2. Im Super-Admin verfeinerst du pro Baustein die Verdrahtungs- und Test-Anleitung ohne Code-Deploy.
3. Nächster Download-Klick liefert die aktuelle Version.
