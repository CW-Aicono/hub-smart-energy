## Kurzfazit aus der aktuellen Prüfung

Ich verstehe den Frust. Die aktuelle 96%-Warnung ist ernst, und ich werde hier nicht behaupten, dass das Problem gelöst ist.

Was ich gerade belastbar prüfen konnte:

- Die Backend-Instanz antwortet grundsätzlich, aber **Health- und Diagnose-Abfragen laufen bereits in Timeouts**. Das ist selbst ein starkes Signal für echte Backend-/Datenbanklast.
- Die langsamsten Statements zeigen sehr klar die aktuelle Hauptlast:
  - `meter_power_readings`: ca. **29.358 Insert-Batches**, zusammen ca. **741 Sekunden DB-Zeit**
  - `bridge_raw_samples`: ca. **7.409 Insert-Batches**, zusammen ca. **437 Sekunden DB-Zeit**
  - `meter_power_readings_5min`: ca. **1.482 Upsert-Batches**, zusammen ca. **403 Sekunden DB-Zeit**
- Read-only Detailabfragen auf die letzten 8 Stunden sind wegen Timeouts fehlgeschlagen. Das spricht dagegen, jetzt noch mehr breit über die Tabellen zu scannen.

Damit ist die wahrscheinlichste echte Ursache nicht „ein langsames Dashboard“, sondern **anhaltende Schreiblast durch Gateway-/Bridge-/Messdaten-Ingestion plus 5-Minuten-Aggregation**.

## Ziel

Nicht weiter Tage verbrennen, sondern in einem kontrollierten Notfall-Schritt:

1. IO sofort stabilisieren.
2. Die genaue Quelle der Schreibflut isolieren.
3. Nur danach gezielt optimieren.
4. Keine kosmetischen UI-Änderungen und keine weiteren Vermutungen.

## Plan

### 1. Sofortiger Diagnose-Snapshot ohne Vollscans

Statt große Zeitreihen-Queries zu fahren, nur kompakte Systemstatistiken abfragen:

- Schreib-/Update-Zähler pro Tabelle aus `pg_stat_user_tables`
- Index-/Tabellengrößen der High-Write-Tabellen
- Dead tuples / Autovacuum-Lage
- Top Statements aus `pg_stat_statements`, eingeschränkt auf Inserts/Upserts
- Prüfung, ob die bereits eingeführten Trigger/Retention-Funktionen wirklich vorhanden und aktiv sind

Wichtig: Keine `count(*)` über große Messwerttabellen, keine breiten 8h-Scans.

### 2. Gateway-/Bridge-Quelle identifizieren

Die drei Hauptkandidaten werden getrennt untersucht:

- `meter_power_readings`
- `bridge_raw_samples`
- `meter_power_readings_5min`

Dafür werden nur indexfreundliche, begrenzte Queries verwendet, z. B. Top-Quellen nach:

- `tenant_id`
- `worker_id`
- `miniserver_serial`
- `meter_id`
- `uuid`
- jüngste Schreibzeit

Ziel: Herausfinden, ob ein einzelner Worker/Miniserver/Gateway ungewöhnlich viele Daten schreibt oder ob die Last breit über alle Quellen verteilt ist.

### 3. Notfall-Drosselung statt weiterer Daueroptimierung

Wenn ein einzelner Worker oder eine einzelne Quelle dominiert, wird nicht pauschal die Instanz vergrößert, sondern gezielt gedrosselt:

- Rohdaten-Insert in `bridge_raw_samples` optional temporär deaktivieren oder stark ausdünnen
- `meter_power_readings` nur noch schreiben, wenn sich Wert oder Zeitfenster relevant verändert haben
- 5-Minuten-Upserts nur noch bei echtem Delta durchführen
- Falls nötig: problematische Quelle temporär quarantänen, statt das ganze System zu belasten

Das ist als Notfallmaßnahme gedacht, damit die IO-Anzeige wieder Luft bekommt.

### 4. Ingestion-Code prüfen

Anschließend wird der Codepfad geprüft, der diese Inserts erzeugt:

- `gateway-ingest`
- Loxone/ws-worker Pfad
- Bridge-/Raw-Sample-Schreiber
- Aggregation nach `meter_power_readings_5min`

Dabei wird geprüft:

- Werden identische Werte unnötig erneut geschrieben?
- Wird pro Sensor zu häufig geschrieben?
- Werden Rohdaten gespeichert, obwohl sie für den Produktbetrieb nicht nötig sind?
- Wird `upsert` genutzt, obwohl ein Delta-Guard sinnvoller wäre?
- Gibt es doppelte Pfade, z. B. Websocket-Worker plus Periodic Sync?

### 5. Konkrete dauerhafte Änderung

Abhängig vom Befund wird genau eine der folgenden dauerhaften Lösungen umgesetzt:

**Variante A: Einzelne Quelle ist Verursacher**
- Source-spezifisches Rate-Limit/Quarantäne
- Logging der betroffenen Quelle
- keine globale Einschränkung für alle Kunden

**Variante B: Rohdaten-Tabelle ist Haupttreiber**
- `bridge_raw_samples` nur noch kurzlebig oder optional speichern
- Default: Rohdaten nicht dauerhaft persistieren, nur aggregierte/zugeordnete Werte
- Retention weiter reduzieren oder ingestion-seitig sampling einführen

**Variante C: Aggregation/Upsert ist Haupttreiber**
- Upsert-Delta-Guard verschärfen
- 5-Minuten-Aggregation entkoppeln oder seltener schreiben
- Aggregationsjob nur auf neue/geänderte Buckets laufen lassen

**Variante D: Doppelte Ingestion-Pfade**
- Periodic Sync und Websocket-Worker sauber entkoppeln
- Periodic Sync nur noch Discovery/Health/Drift-Korrektur, nicht dauerhafte Live-Datenflut

### 6. Erfolgskontrolle

Nach Umsetzung wird nicht nur „fertig“ gemeldet, sondern geprüft:

- Top-Schreibqueries erneut vergleichen
- Tabellenstatistik erneut vergleichen
- Backend-Health erneut abrufen
- IO-Indikator später erneut bewerten, mit Hinweis, dass die Lovable-Anzeige verzögert sein kann

## Was ich nicht tun werde

- Nicht erneut blind Indizes hinzufügen oder entfernen.
- Nicht zuerst ein größeres Cloud-Upgrade empfehlen.
- Nicht behaupten, die Ursache sei gefunden, bevor eine Quelle eindeutig belegt ist.
- Keine breiten `count(*)`-Analysen über große Messwerttabellen, solange die DB unter Last steht.

## Erwartetes Ergebnis

Am Ende soll klar benannt sein:

- welche Tabelle die IO treibt,
- welcher Worker/Gateway/Meter/Job dahinter steckt,
- welche konkrete Änderung die Schreiblast reduziert,
- und ob zusätzlich Infrastrukturmaßnahmen nötig sind oder nicht.