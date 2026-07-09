## Ziel

Im Sales Scout sollen beim Anlegen/Bearbeiten eines Projekts optional bereits alle strukturellen Daten erfasst werden können, die später bei der Konvertierung in einen Mandanten automatisch übernommen werden — statt dass der neue Mandant „leer" startet und alles nochmal angelegt werden muss.

## Was aktuell schon existiert

- `sales_projects` — Kunde, Kontakt, Adresse, Notizen
- `sales_distributions` + `sales_measurement_points` + `sales_recommended_devices` — Elektro-Verteiler, Messstellen (Energieart, Phasen, A, V …) und daraus abgeleitete Hardware-Empfehlungen
- Konverter (`sales-convert-to-tenant`) legt heute an: Tenant + Module + **eine** Haupt-Location (nur Name + Adresse). Alles andere (Etagen, Räume, Zähler, Energiearten) muss der Kunde/Partner danach im Mandanten manuell nachpflegen.

## Was auf Mandanten-Seite existiert (Zielstruktur)

- `locations` — Liegenschaft (Adresse, Bauart, Baujahr, Fläche, Heizungsart, Warmwasser, Bundesland, Netzanschluss-kW …)
- `location_energy_sources` — welche Energiearten die Liegenschaft nutzt (Strom, Gas, PV, Wärmepumpe, Fernwärme …)
- `floors` — Etagen (Nr., Name, Fläche)
- `floor_rooms` — Räume (Name, Maße, Höhe)
- `meters` — Zähler / Sensoren (Name, Zählernummer, Energieart, Einheit, Hauptzähler ja/nein, Parent-Zähler)

## Empfohlener Ansatz

**Sales-seitig eine schlanke, mandanten-parallele Struktur einführen** und beim Convert 1:1 übertragen. Bewusst *nicht* alles in `sales_projects`-JSON, weil (a) mehrere Liegenschaften pro Projekt möglich sein sollen und (b) Etagen/Räume/Zähler bereits n:m sind und im UI editierbar sein müssen.

### Neue Tabellen

1. `**sales_locations**` — Liegenschaften des Projekts
  Felder: `project_id`, `name`, `adresse`, `usage_type`, `net_floor_area`, `construction_year`, `renovation_year`, `heating_type`, `federal_state`, `grid_limit_kw`, `hot_water_energy_type`, `is_main`, `notizen`
2. `**sales_location_energy_sources**` — pro Liegenschaft aktive Energiearten (`energy_type`, `custom_name`)
3. `**sales_floors**` — `location_id (sales)`, `name`, `floor_number`, `area_sqm`
4. `**sales_rooms**` — `floor_id (sales)`, `name`, Maße (optional)
5. `**sales_meters**` — `location_id (sales)`, optional `floor_id`/`room_id`, `parent_sales_meter_id`, `name`, `meter_number`, `energy_type`, `unit`, `is_main_meter`, `medium`, `notes`

Alle mit `ON DELETE CASCADE` an `project_id`, RLS analog zu `sales_distributions` (Partner sieht eigene Projekte, Super-Admin alles), GRANTs für `authenticated` + `service_role`.

Bezug zu bestehenden Sales-Tabellen: `sales_distributions.location_id` (neu, optional) und `sales_measurement_points.room_id` (neu, optional) erlauben die spätere Zuordnung Verteiler↔Liegenschaft und Messstelle↔Raum. Für Bestandsprojekte bleibt beides `NULL` — keine Migration von Bestandsdaten nötig.

### UI-Erweiterungen (`/sales/:id/edit` und Projekt-Detail)

Neuer Reiter **„Liegenschaft & Struktur"** mit ausklappbaren, komplett optionalen Blöcken:

- **Liegenschaften** (n) — Karte pro Liegenschaft: Adresse, Nutzungsart, Fläche, Baujahr, Heizung, Warmwasser, Bundesland, Netzanschluss
  - **Energiearten** als Chip-Multi-Select (Strom, Gas, Wärme, Wasser, PV, Wärmepumpe, EV, Speicher …)
  - **Etagen** — kompakte Liste (Nr., Name, Fläche); pro Etage
    - **Räume** — Liste (Name, optional B×T×H)
  - **Zählerstruktur** — Baum-View mit Hauptzähler → Unterzähler (Name, Zählernummer, Energieart, Einheit), Zuordnung zu Etage/Raum optional

Alles bleibt optional; bestehendes „Kunde/Kontakt/Adresse"-Formular bleibt unverändert und wird beim Convert auf die **Haupt-Liegenschaft** gemappt, falls keine `sales_locations` erfasst wurden (Backwards-Compat).

### Convert-Erweiterung (`sales-convert-to-tenant`)

Nach Tenant-Anlage:

1. Wenn `sales_locations` vorhanden → für jede eine `locations`-Zeile anlegen (Haupt = `is_main_location`); sonst wie bisher eine Default-Location aus Projekt-Adresse.
2. Für jede Sales-Location: `location_energy_sources`, dann `floors`, dann `floor_rooms`, dann `meters` (Reihenfolge wichtig wegen `parent_meter_id` — Hauptzähler zuerst, dann Kinder mit gemappter Parent-ID).
3. ID-Mapping (`sales_meter_id → meter_id` etc.) in-memory halten, damit `parent_meter_id`, `location_id`, `room_id` korrekt gesetzt werden.
4. Optional: falls `sales_distributions.location_id` gesetzt ist, kann später eine ähnliche Konvertierung in ein Verteiler-Modell erfolgen — **out of scope für diesen Schritt**.

### Sicherheitsnetz

- Vor dem Convert: Warnung im `ConvertProjectDialog`, wenn keinerlei Struktur erfasst wurde (heutiges Verhalten) — nur Hinweis, kein Block.
- Convert bleibt idempotent-geschützt über `converted_tenant_id`.

## Nicht Teil dieses Plans (bewusst)

- Import aus Photo/KI der Verteiler in die Zähler-Struktur — bleibt manuell.
- Übertragen von Tarifen, Preisen, Nutzern, Gateway-Config in den Mandanten.
- Rückrichtung Mandant → Sales.

## Umsetzungs-Schritte

1. Migration: fünf neue Tabellen + RLS + GRANTs + `updated_at`-Trigger; zusätzlich `sales_distributions.location_id` und `sales_measurement_points.room_id` als optionale FKs.
2. Neuer Tab „Liegenschaft & Struktur" in `SalesProjectForm` (aufgeteilt in Sub-Komponenten `SalesLocationCard`, `SalesFloorsEditor`, `SalesMetersTree`).
3. Hooks/Utils analog zu bestehenden Sales-Komponenten (Query, Mutations, optimistic UI nicht nötig).
4. `sales-convert-to-tenant` erweitern (siehe oben) inkl. Reihenfolge & ID-Mapping.
5. `ConvertProjectDialog` um Struktur-Zusammenfassung + Hinweis ergänzen.
6. Kurzer Vitest für den ID-Mapping-Helper (Parent-Meter-Auflösung).

## Offene Rückfragen

- Sollen **mehrere Liegenschaften pro Projekt** erlaubt sein (Empfehlung: ja, wie beschrieben) oder bewusst nur genau eine?
- Sollen die im Sales erfassten **Verteiler/Messstellen** beim Convert zusätzlich als Zähler/Sensoren in `meters` angelegt werden, oder bleibt das bewusst getrennt (Sales = Angebot, Zählerstruktur = tatsächlicher Betrieb)?  
  
Antworten:  
1. Ja, es sollen mehrere Liegenschaften für enen Mandanten/Projekt erlaubt sein  
2. Messstellen/Sensoren/Geräte können erst nach Erfassung durch Gateway separat hinterlegt werden