

## Iteration 9 – Komplettes Angebot: Zubehör, Gateways & "Andere kauften auch"

Der Katalog kennt bisher nur Zähler. Für ein vollständiges Angebot fehlen Geräteklassen (Gateway, Netzteil, Switch, Router, Addon-Modul, Verkabelung) sowie eine Verknüpfungslogik, damit z. B. ein Loxone Miniserver automatisch ein passendes Netzteil + Modbus-Extension vorschlägt.

### 1. Datenbank-Erweiterung (Migration)

**`device_catalog` ergänzen:**
- `geraete_klasse` enum: `meter | gateway | power_supply | network_switch | router | addon_module | cable | accessory | misc`
- `benoetigt_klassen` text[] – welche Klassen MÜSSEN mitbestellt werden (z. B. `['power_supply']`)
- `kompatible_klassen` text[] – Klassen, die typischerweise dazu passen
- `tech_specs` jsonb – z. B. `{ voltage: "24V", din_rail: true, ports: 8 }`
- `einheit` text – "Stück" / "Meter" / "Pauschal"

**Neue Tabelle `device_compatibility`** (gerichtete Beziehungen):
- `source_device_id` → `target_device_id`
- `relation_type`: `requires` (Pflicht) | `recommends` (optional Vorschlag) | `alternative`
- `auto_quantity_formula` text – z. B. `"1"` oder `"ceil(source.menge/8)"` für Switch-Ports
- `prio` integer, `notiz` text

**`sales_recommended_devices` ergänzen:**
- `parent_recommendation_id` uuid (self-FK) – markiert Zubehör eines Hauptgeräts
- `geraete_klasse` text (denormalisiert für schnelle UI-Filter)

**Seed-Daten** für realistischen Start:
- Loxone: Miniserver Go, Miniserver, Modbus Extension, Tree Extension, Energiezähler 1-/3-phasig, Netzteil 24V/2.5A, DIN-Hutschienen-PSU
- Netzwerk: TP-Link 8-Port Switch, Ubiquiti Switch, FritzBox 7530
- Universal: USB-C Netzteil 5V, Patchkabel Cat6 (1m/3m/5m)
- Compatibility-Regeln: Miniserver → erfordert Netzteil 24V; Miniserver → empfiehlt Modbus Extension; jeder Gateway → empfiehlt Switch wenn >4 Geräte

### 2. Edge Functions

**Neu: `sales-suggest-accessories`**
- Input: `project_id` oder `measurement_point_id`
- Sammelt alle aktuell empfohlenen Hauptgeräte → liest `device_compatibility` → liefert:
  - `required[]` (rot/Pflicht – auto-übernehmbar)
  - `recommended[]` ("Andere kauften auch …")
- Berechnet Mengen über `auto_quantity_formula` (sicherer Mini-Evaluator, keine `eval()`)

**Erweitern: `sales-recommend-devices`**
- Nach KI/Regel-Auswahl des Hauptgeräts: ruft intern Pflicht-Zubehör ab und legt diese als Kind-Empfehlungen (`parent_recommendation_id` gesetzt) an
- Optionales Zubehör NUR vorschlagen, nicht automatisch anlegen

**Erweitern: `sales-generate-quote`**
- PDF gruppiert nach Geräteklasse: "Zähler", "Gateways & Steuerung", "Netzwerk", "Zubehör & Montagematerial"
- Zwischensummen pro Gruppe
- Eltern-Kind-Hierarchie sichtbar (Einrückung)

### 3. UI-Erweiterungen

**`src/pages/admin/DeviceCatalogAdmin.tsx`** (Super-Admin):
- Neue Felder: Geräteklasse-Select, benötigte/kompatible Klassen (Multi-Select Chips), Einheit
- Neuer Tab "Kompatibilität": pro Gerät die Beziehungen verwalten (Drag-Liste mit `requires`/`recommends`)

**`src/components/sales/DeviceRecommendation.tsx`** (Hauptkomponente am Messpunkt):
- Klassen-Badge (Icon je Klasse: ⚡ Zähler, 🌐 Gateway, 🔌 Netzteil, 🖧 Switch, 🧩 Addon)
- Neuer Bereich **"Zubehör"** unter dem Hauptgerät:
  - Pflicht-Zubehör automatisch sichtbar mit Badge "Erforderlich" – beim ersten Anlegen direkt mit erstellt
  - **"Andere Kunden wählten auch"**-Block mit Karten + "+ Hinzufügen"-Button (Amazon-Style)
  - Trash-Button entfernt nur das Kind, Hinweis falls Pflicht-Zubehör entfernt wird

**Neu: `src/components/sales/AccessorySuggestions.tsx`**
- Lädt von `sales-suggest-accessories`
- Horizontale Scroll-Karten mit Bild/Name/Preis und Quick-Add
- Dedup: blendet bereits hinzugefügtes Zubehör aus

**`QuoteBuilderSheet.tsx`**:
- Vor "Angebot generieren" eine letzte Übersicht "Vollständigkeitsprüfung":
  - Warnt wenn Gateway ohne Netzteil, Switch fehlt bei >4 IP-Geräten, etc.
  - Gelbe Banner mit "Empfehlung übernehmen"-Button

**`SalesProjectDetail.tsx`**: Projekt-Summary-Karte zeigt Anzahl pro Klasse ("3 Zähler · 1 Gateway · 1 Netzteil · 1 Switch")

### 4. Dependency-Resolver (Frontend-Hook)

**Neu: `src/hooks/useAccessorySuggestions.ts`**
- Zentral verwendet von `DeviceRecommendation` und `QuoteBuilderSheet`
- Cache via React Query, Invalidation bei Änderung von `sales_recommended_devices`

### Technische Details
- Mengenformel-Evaluator: nur Whitelist-Ausdrücke (`ceil`, `floor`, Variablen `source.menge`, Konstanten), kein dynamischer JS-Code
- RLS: `device_compatibility` analog zu `device_catalog` (lesen für Authenticated, schreiben nur Super-Admin)
- Migration legt Indizes auf `device_compatibility(source_device_id)` und `sales_recommended_devices(parent_recommendation_id)`
- i18n: neue Keys nur DE (Sales-App ist DE-only laut bisherigem Stand)

### Reihenfolge
1. Migration + Seed (Geräte, Klassen, Compat-Regeln)
2. Admin-UI für Katalog-Pflege
3. Edge Function `sales-suggest-accessories` + Erweiterung `sales-recommend-devices`
4. UI: `AccessorySuggestions` + Integration in `DeviceRecommendation`
5. PDF-Gruppierung in `sales-generate-quote`
6. Vollständigkeitsprüfung im QuoteBuilder

