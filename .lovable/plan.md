## Kurzantwort

Nein — die Tabellengröße ist nicht der Engpass. 1,85 Mio Zeilen / 432 MB sind für Postgres unkritisch. Was uns bisher umgeworfen hat, waren drei andere Dinge:

1. **Schreiblast + Bloat**: sehr viele kleine Writes/Updates pro Minute, dazu Autovacuum, das nicht hinterherkam → aufgeblähte Tabellen, Random-IO, ausgeschöpftes Disk-IO-Budget der Instanz.
2. **Lesemuster**: Charts haben teils breite Zeitfenster über viele Zähler auf einmal geladen (`ANY(...)`-Queries, große Ergebnismengen), zusätzlich RLS-Overhead pro Zeile.
3. **Wartungsjobs**, die parallel zur Last liefen.

5-Minuten-Graphen sind damit weiterhin möglich — sie müssen nur anders gelesen und gespeichert werden.

## Wie Big-Data-Systeme das lösen

Die Muster, die dort Standard sind und hier 1:1 anwendbar:

- **Zeit-Partitionierung**: eine Tabelle pro Monat/Woche statt einer großen. Alte Partitionen werden gelesen, aber nie mehr geschrieben oder gevacuumt → Wartungslast fällt weg, Löschen/Archivieren ist ein `DROP` in Millisekunden.
- **Rollups / Multi-Resolution**: 5 Min für den nahen Zeitraum, 15 Min / 1 h / 1 Tag für ältere — und die Abfrage wählt automatisch die Auflösung passend zum Zoom-Level. Genau das machen Grafana/Prometheus/TimescaleDB.
- **Query nur nach Bedarf**: nie „alles laden und im Browser filtern", sondern serverseitig aggregieren, immer mit Zeitfenster-Grenze, und Downsampling auf ca. 300–800 Punkte pro Chart (mehr kann ein Bildschirm nicht darstellen).
- **Append-only statt Update**: Rohdaten nur einfügen, nie aktualisieren → drastisch weniger IO.
- **Spaltenorientierte Kompression** für Historie (Timescale/ClickHouse: Faktor 10–20 kleiner).

## Vorgeschlagener Weg (stufenweise, jede Stufe eigenständig nützlich)

**Stufe A — Lesepfad zoom-abhängig machen (größter Effekt, kein Datenverlust)**
- Zentrale Server-Funktion, die zu einem angefragten Zeitfenster automatisch die passende Auflösung wählt: bis 2 Tage → 5 Min, bis 14 Tage → 15 Min, bis 90 Tage → 1 h, darüber → 1 Tag.
- Charts fragen nur noch das sichtbare Fenster ab (kein Vorab-Laden ganzer Zeiträume), je Zähler einzeln und parallel.
- Harte Obergrenze an zurückgegebenen Punkten pro Serie.

**Stufe B — Speicherung: 5 Min behalten statt verdichten**
- Die laufende Verdichtung auf 15 Min stoppen, sobald A greift; stattdessen zusätzliche Rollup-Ebenen (1 h, 1 Tag) neben den 5-Min-Daten pflegen.
- 5-Min-Daten bleiben vollständig erhalten und sind über Stufe A nur bei engem Zeitfenster im Spiel.

**Stufe C — Monatliche Partitionierung der 5-Min-Tabelle**
- Umbau auf partitionierte Tabelle mit automatischem Anlegen neuer Monate.
- Effekt: Autovacuum-Last nur auf dem aktuellen Monat, alte Monate „eingefroren", Archivieren später trivial.

**Stufe D — optional, wenn Datenvolumen später stark wächst**
- Historie zusätzlich in einen spaltenorientierten Speicher (ClickHouse-Connector ist verfügbar) auslagern und Langzeit-Analysen dorthin routen. Erst sinnvoll ab deutlich größeren Datenmengen als heute.

## Technische Details

- Auflösungswahl serverseitig in einer SQL-Funktion (`SECURITY DEFINER`, Tenant-Filter explizit), damit RLS nicht zeilenweise auf Millionen Rohzeilen ausgewertet wird.
- Rollup-Tabellen inkrementell per Cron befüllen (Wasserstandsmarke statt Vollberechnung).
- Partitionierung als Online-Umbau: neue partitionierte Tabelle, Daten in Etappen kopieren, dann umschalten — kein Downtime-Fenster nötig, aber ein ruhiges Zeitfenster empfohlen.
- Indizes je Partition auf `(tenant_id, meter_id, bucket)`; Covering-Index für die häufigsten Chart-Abfragen.
- Alle Zahlen weiterhin im deutschen Format in der UI.

## Wichtige Vorbedingung

Der aktuell laufende Verdichtungs-Job (`ems-compact-5min-drain`) reduziert gerade Altdaten auf 15 Min. Wenn 5-Min-Historie langfristig erhalten bleiben soll, sollte er gestoppt werden, bevor er weiter fortschreitet — das wäre der erste Schritt der Umsetzung.
