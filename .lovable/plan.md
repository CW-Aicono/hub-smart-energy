## Ziel

Bausteine, deren Werte ausschließlich in der Cloud entstehen (Arbitrage-Fahrplan, Peak-Event-Vorladen, Community-Anteil, CO₂-Fenster, Grid-Operator-Signal, Storage-Arbitrage-SoC), benötigen eine dauerhafte Online-Verbindung zwischen Miniserver und AICONO-Cloud. Nutzer müssen das an **zwei Stellen** sofort erkennen:

1. **Baustein-Katalog** (Super-Admin + Anleitung/Tenant-Ansicht) → klares Tag „Cloud erforderlich · nicht offline-fähig"
2. **Automation-Editor in der Liegenschaft** → Ausführungsort „Loxone lokal" wird für diese Bausteine gesperrt bzw. mit Warnung versehen

## Umsetzung

### 1. Datenmodell — Katalog erweitern
- Neues Feld `requires_cloud: boolean` in `src/lib/loxone/snippetsCatalog.ts` pro Snippet.
  - `true` für: `ArbitrageDispatch`, `PeakEventPrecharge`, `GridOperatorSignal`, `CommunityAllocation`, `Co2LoadShift`, `StorageArbitrageSoc` (Gruppen H/I/J) — alle Push-Kanal-Bausteine.
  - `false` (Default) für lokal autarke Bausteine (GridProtect, DLM etc.).
- Katalog-Version → **v1.2.1**, in `catalogSeed.ts` Feld mit-upserten (DB-Spalte `requires_cloud` per Migration ergänzen, Default `false`).

### 2. Super-Admin — Loxone-Templates
- Tag „Cloud erforderlich" (Icon ☁️ + Tooltip „Benötigt aktive Verbindung zum Miniserver — nicht offline-fähig") in der Bausteinliste `SuperAdminLoxoneTemplates.tsx`.
- Gleiche Kennzeichnung im Anleitungs-Editor (`LoxoneManualsEditor.tsx`) sowie automatisch als Hinweis-Absatz im generierten PDF (`generateManualPdf.ts`).

### 3. Tenant — Integrationskachel & Automation-Editor
- **`AutomationRuleBuilder.tsx`** (Ausführungsort-Dropdown, siehe Screenshot):
  - Wenn die gewählte Automation an ein `requires_cloud=true`-Template gebunden ist:
    - Option „Loxone lokal" wird **disabled** angezeigt mit Sublabel „Nicht verfügbar — Cloud-Werte erforderlich".
    - Default wird auf `hybrid` (empfohlen) gesetzt, `cloud` bleibt wählbar.
    - Info-Alert oberhalb: „Dieser Baustein wird von der Cloud mit Werten versorgt (z. B. Arbitrage-Fahrplan). Bei Internet-Ausfall pausiert die Aktualisierung — der Miniserver behält den letzten Wert."
- **Integrationskachel / Baustein-Badge** (`LoxoneManualDownloadButton.tsx` bzw. umliegende Chip-Zeile): Chip „Cloud" neben dem Template-Namen anzeigen.

### 4. Übersetzungen
- Neue Keys in `src/i18n/*` (DE/EN/ES/NL): `loxone.requiresCloud.tag`, `loxone.requiresCloud.tooltip`, `loxone.requiresCloud.automationHint`, `loxone.executionMode.localDisabledReason`.

### 5. Migration & Seed
- Migration: `ALTER TABLE loxone_snippet_registry ADD COLUMN requires_cloud boolean NOT NULL DEFAULT false;`
- Nach Deploy: Button „Katalog aus Snippet-Bibliothek befüllen" erneut klicken → v1.2.1 upserted die Flag.

## Nicht Teil dieses Plans
- Umbau 5-s-Poll → Realtime-Subscription (separater Vorschlag, unabhängig).
- Änderungen am Worker oder an der Push-Logik.

## Für Sie danach (Laien-Schritte)
1. Im Super-Admin → Loxone-Templates → „Katalog aus Snippet-Bibliothek befüllen" klicken.
2. In einer Liegenschaft eine Test-Automation vom Typ „ArbitrageDispatch" öffnen → prüfen, dass „Loxone lokal" ausgegraut ist und der Cloud-Hinweis erscheint.
3. Im Baustein-Katalog prüfen, dass ☁️-Chip bei den 6 Cloud-Bausteinen sichtbar ist.
