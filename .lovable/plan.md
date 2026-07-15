## Ausgangslage

- User: **cw@aicono.de** (Admin, Tenant „Stadt Steinfurt", `0ce0c43a-…`).
- Screenshot: Widget **„Energieverbrauch (kW)"**, Tag-Ansicht, Alle Liegenschaften, komplett leer.
- Gleiche Beobachtung wie zuvor bei geteilten Custom-Widgets.

## Was ich verifiziert habe

1. **DB hat Daten** für den heutigen Tag (Stadt-Steinfurt-Tenant):
   - `meter_power_readings_5min_bridge` ≈ 260 Buckets/Meter (Strom-, Gas-, Wasser-Hauptzähler)
   - Auch `meter_power_readings` (Roh) und Legacy-5min-Tabelle gefüllt.
2. **RPC `get_power_readings_5min`** ist `SECURITY DEFINER` und `authenticated` hat `EXECUTE` → RLS ist hier keine Sperre.
3. **RLS auf `meter_power_readings`** erlaubt Tenant-Users vollen Zugriff (`tenant_id = get_user_tenant_id()`) → cw ist Tenant-Mitglied, sollte lesen dürfen.
4. **Playwright-Repro als cw@aicono.de** (via injizierter Session): Standard-Widget **„Energieverbrauch (kW)"** rendert **eine Kurve mit Daten** (Screenshot in `/tmp/browser/sc/1.png`). Der leere Zustand aus dem Screenshot ließ sich damit **nicht reproduzieren**.

Ergebnis der Recherche: Das Standard-`EnergyChart`-Widget funktioniert für cw@aicono.de auf der aktuellen Preview-Sitzung. Bevor ich einen Fix baue, muss geklärt werden, welches Widget genau leer bleibt – sonst besteht das Risiko, an der falschen Stelle zu ändern (Verstoß gegen unser Rateverbot).

## Andere möglicherweise betroffene Widgets (Kandidaten, gleicher Datenpfad)

Alle greifen auf tenant-gescopte Zähler + `meter_power_readings*` / `energy_readings_daily` zu:

- `EnergyChart` (Standard) — Kandidat
- `CustomWidget` (line/bar für ausgewählte Meter) — geht direkt auf `meter_power_readings` (RLS-Pfad)
- `EnergyFlowMonitor` (auch als Custom-Widget) — geht auf gleiche Rohdaten
- `PieChartWidget`, `SankeyWidget`, `SustainabilityKPIs`, `CostOverview`
- `ForecastWidget`, `AnomalyWidget`, `WeatherNormalizationWidget`

## Vorschlag: 2-Schritt-Vorgehen

### Schritt 1 – Reproduktion sicherstellen (KEIN Code-Fix)

Ich brauche vom User eine Info, sonst rate ich:

1. Ist das Widget im Screenshot das **Standard-Widget „Energieverbrauch (kW)"** oder ein **Custom-Widget** mit gleichem Titel (Dashboard-Anpassen prüfen)?
2. Reproduzierbar auch nach **Hard-Reload** (Cache leeren) und in einem **Inkognito-Fenster**?
3. Bleibt es leer auch, wenn eine **einzelne Liegenschaft** statt „Alle Liegenschaften" gewählt wird?
4. Welche **anderen Widgets** sind konkret leer (Kosten, Energieverteilung, Energiemonitor Rathaus, …)? Ist z. B. das Kosten-KPI korrekt (im Screenshot sind 141,54 €)?

Parallel dazu füge ich – falls gewünscht – **temporäre Diagnostik** in `EnergyChart` und `CustomWidget` ein:

```ts
console.info("[energy-chart] meterIds", mainMeterIds, "rows", allData.length, "range", rangeStart, rangeEnd);
```

### Schritt 2 – Fix nach eindeutiger Diagnose

Je nach Ergebnis einer der folgenden Wege:

- **Fall A – RLS-Loch auf einer 5-min-Tabelle** (z. B. `meter_power_readings_5min_bridge` ohne Policy für authenticated): Migration mit `ENABLE RLS` + `SELECT`-Policy für Tenant-User + expliziten `GRANT SELECT … TO authenticated;`.
- **Fall B – Fehlender GRANT auf einer RPC** (z. B. `get_meter_daily_totals_with_fallback`): `GRANT EXECUTE … TO authenticated;` per Migration.
- **Fall C – Client-seitige Filter-Race** (z. B. `tenantMeterIds.length === 0` beim ersten Render → RPC wird nie erneut aufgerufen): Query-Key um `tenantMeterIds` erweitern bzw. `enabled`-Bedingung anpassen, damit sie nachrückt, sobald Zähler geladen sind.
- **Fall D – Custom-Widget-Sichtbarkeit**: analog zum vorigen Trigger-Fix ggf. Config-Copy pro User oder Fallback in `CustomWidget`, wenn `config.meter_ids` Zähler enthält, auf die der User keinen Lesezugriff hat.

Jede Änderung wird per Playwright-Session mit cw@aicono.de verifiziert (Screenshot + Netzwerk-Log der RPC-Aufrufe), bevor die Aufgabe als erledigt gemeldet wird.

## Was ich NICHT tue, bis Schritt 1 abgeschlossen ist

- Keine RLS-/GRANT-Migrationen „auf Verdacht".
- Keine Änderungen an `EnergyChart`/`CustomWidget`-Logik ohne reproduzierten Fehler.
- Keine Trigger-Backfills wie beim Custom-Widget-Sharing – das Standard-Widget ist bereits tenant-weit sichtbar.
