## Aktueller Befund

- Lovable Cloud wird von der Kontrollschicht als erreichbar gemeldet, aber **alle echten Datenbankzugriffe brechen mit Connection-Timeouts ab** – einschließlich DB-Metriken, Slow-Query-Auswertung und einfacher Diagnoseabfragen.
- Damit ist heute eine **vollständige Datenbank-/Verbindungssättigung** belegt. Der konkrete Prozess ist noch nicht belegbar, weil selbst `pg_stat_activity` und `cron.job_run_details` nicht mehr lesbar sind.
- Im versionierten Stand existieren weiterhin zahlreiche Cron-Zeitpläne ohne Offset (`*/1`, `*/2`, `*/5`, `*/10`, `*/15`, `0 * * * *`) sowie temporär angelegte Jobs wie ein zweiminütiger `VACUUM` und ein fünfminütiger Drain-Job. Ob diese heute live aktiv sind, wird direkt nach der Wiederherstellung geprüft; vorher wäre eine Ursachenzuschreibung geraten.

## Vorgehen

1. **Backend kontrolliert neu starten**
   - Datenbank und Auth wieder erreichbar machen.
   - Status bis zur vollständigen Betriebsbereitschaft überwachen.

2. **Unmittelbar nach dem Start Beweise sichern**
   - Aktive und wartende Verbindungen, Blockaden, lange Transaktionen und Worker erfassen.
   - Alle aktiven Cron-Jobs mit Zeitplan auslesen.
   - Fehlgeschlagene, überlappende und ungewöhnlich lange Cron-Läufe der letzten 12 Stunden prüfen.
   - Slow Queries, WAL, Deadlocks, Rollbacks, OOM-Ereignisse und Pool-Auslastung erfassen.

3. **Heutigen Auslöser exakt bestimmen**
   - Prüfen, welche Jobs zur Ausfallminute gleichzeitig starteten.
   - Temporäre Backfill-/Drain-/Vacuum-Jobs auf Laufzeit, Überlappung und Abschlussstatus prüfen.
   - Falls kein Cron-Sturm vorliegt: blockierende Query, Autovacuum, Edge-Function-Wiederholung oder externe Ingestion anhand der Live-Daten isolieren.

4. **Sofortige Entlastung**
   - Nur nachgewiesene Lastverursacher stoppen beziehungsweise entschärfen.
   - Abgeschlossene temporäre Jobs dauerhaft deaktivieren und aus dem aktiven Zeitplan entfernen.
   - Keine Daten löschen und keine 5‑Minuten-Historie reduzieren.

5. **Dauerhafte Cron-Sicherung als Migration**
   - Sämtliche aktiven periodischen Jobs auf kollisionsfreie Minuten-Offsets verteilen; keine neuen `*/N`-Zeitpläne ohne Offset.
   - Schwere Wartungsjobs strikt seriell und nur im Nachtfenster ausführen.
   - Pro schwerem Job einen Advisory-Lock einbauen, sodass ein neuer Lauf nicht startet, solange der vorherige noch läuft.
   - Laufzeitbegrenzungen und sichere Abbruchbedingungen für Backfills/Vacuum-nahe Wartung ergänzen.

6. **Automatische Überlastungsprävention**
   - Einen leichten Wächter einführen, der Cron-Überlappungen, `job startup timeout`, lange Laufzeiten und Connection-Druck protokolliert beziehungsweise alarmiert.
   - Temporäre Jobs mit automatischem Ablaufdatum/Selbst-Deaktivierung versehen.
   - Drift-Prüfung erweitern, damit nicht versionierte oder erneut aktivierte Live-Jobs erkannt werden.

7. **Validierung**
   - Login und zentrale Tenant-Seiten testen.
   - DB-Gesundheit und Verbindungen über mehrere Cron-Zyklen beobachten.
   - Abschließend den belegten Auslöser, die betroffenen Jobs und die dauerhafte Änderung dokumentieren.