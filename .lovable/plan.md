

## Iteration 10 – Angebots-Entwürfe & freie Hardware-Positionen

Zwei Ergänzungen zum Sales-Workflow:

### 1. Entwurf → Fertigstellen-Workflow

Aktuell erzeugt jeder Klick auf "Angebot generieren" sofort eine versionierte PDF in `sales_quotes`. Künftig:

**Schema (Migration):**
- `sales_quotes`: neue Spalte `status` text default `'draft'` (`draft | finalized | sent | signed | rejected`)
- Bestehende Angebote werden auf `'finalized'` gesetzt

**Edge Function `sales-generate-quote`:**
- Neuer Input-Parameter `finalize: boolean` (default `false`)
- `draft`: Angebot wird gespeichert, aber **ohne** PDF-Generierung, ohne `public_token`-Versand-Freigabe; `version` bleibt provisorisch (z. B. `0` oder negativer Index – wir nutzen `version = 0` für aktiven Draft pro Projekt)
- `finalize: true`: PDF wird erzeugt, `version` auf nächste reale Versionsnummer hochgezogen, Status `finalized`

**UI `QuoteBuilderSheet.tsx`:**
- Zwei Buttons im Footer:
  - **"Als Entwurf speichern"** (sekundär) – speichert Modulauswahl/Notizen, schließt Sheet, Toast "Entwurf gespeichert"
  - **"Fertigstellen & PDF erzeugen"** (primär) – aktueller Flow inkl. Vollständigkeitsprüfung
- Beim Öffnen lädt das Sheet einen vorhandenen Draft (sofern existiert) und füllt Module/Notizen vor

**UI `QuotesList.tsx`:**
- Draft-Badge (grau "Entwurf") oben in der Liste
- Draft-Zeile zeigt Button "Weiter bearbeiten" statt Download/Share
- Bei Fertigstellung verschwindet der Draft, neue finale Version erscheint

### 2. Freie Hardware-Positionen (nicht an Messpunkt gebunden)

Aktuell hängt jedes Gerät an einem `sales_measurement_point`. Für Gateways, Switches, Router, Verkabelung im Schaltschrank ist das unpassend.

**Schema (Migration):**
- `sales_recommended_devices.measurement_point_id` wird **nullable**
- Neue Spalte `distribution_id` uuid (nullable, FK auf `sales_distributions`) – Hardware der Verteilung statt einem Messpunkt zugeordnet
- Neue Spalte `scope` text default `'measurement_point'` (`measurement_point | distribution | project`) zur expliziten UI-Filterung
- Bestehende Daten: `scope = 'measurement_point'`

**Edge Functions:**
- `sales-suggest-accessories` und `sales-generate-quote` sammeln zusätzlich Geräte über `distribution_id` bzw. `project_id` (über Verteilung → Projekt-Join)
- PDF gruppiert weiterhin nach Klasse, mit zusätzlichem Sublabel "Schaltschrank-Ebene" wenn `scope = 'distribution'`

**UI – neue Komponente `DistributionHardwareList.tsx`:**
- Eingebettet in `SalesProjectDetail.tsx` direkt unter dem Verteilungs-Header (über den Messpunkten)
- Zeigt frei zugeordnete Geräte (Gateways, Switches, Netzteile, Router, Verkabelung) der Verteilung
- Button **"Hardware hinzufügen"** öffnet Picker-Dialog `AddHardwareDialog.tsx`:
  - Klassen-Filter-Tabs (Gateway, Switch, Router, Netzteil, Addon, Verkabelung, Zubehör)
  - Suchfeld + Kartenliste aus `device_catalog` (gefiltert nach Klasse ≠ `meter`)
  - Mengenfeld + "Hinzufügen"
- Pflicht-Zubehör des hinzugefügten Geräts wird via `sales-suggest-accessories` automatisch mit angelegt (gleiche Logik wie bei Messpunkt-Geräten)

**`DeviceRecommendation.tsx` (Messpunkt-Ebene):**
- Bleibt unverändert – Zähler-fokussiert
- Klassen-Filter blendet Gateway/Switch/Router künftig aus (gehören in Verteilungs-Ebene)

**`CompletenessCheck.tsx`:**
- Berücksichtigt Geräte aus beiden Scopes für Gateway↔Netzteil-Prüfung
- Neue Regel: Wenn `>1` Gateway in einer Verteilung → Switch empfohlen

### Reihenfolge
1. Migration: `status` auf `sales_quotes`, `distribution_id` + `scope` auf `sales_recommended_devices`
2. Edge Functions anpassen (`sales-generate-quote` Draft-Modus, `sales-suggest-accessories` Scope-aware)
3. `QuoteBuilderSheet` + `QuotesList` Draft-UI
4. `AddHardwareDialog` + `DistributionHardwareList` + Integration in `SalesProjectDetail`
5. `CompletenessCheck` erweitern

