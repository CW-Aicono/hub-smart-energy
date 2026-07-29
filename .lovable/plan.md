**Ziel:** Login und Seitenladezeiten stabilisieren, indem die aktuell belastenden temporären Datenbank-Wartungsjobs beendet werden und danach geprüft wird, ob die Last zurückgeht.

**Aktueller Befund:**
- Der hosted Backend-Dienst antwortet grundsätzlich.
- Metriken und Slow-Query-Abfrage laufen aber weiterhin in Timeouts.
- Das passt dazu, dass die zuvor eingerichteten temporären Jobs für `VACUUM ANALYZE` und beschleunigtes Cleanup die Datenbank gerade zusätzlich belasten.

**Jetzt auszuführender Task:**
1. **Temporäre Jobs deaktivieren/entfernen**
   - `ems-vacuum-5min-once`
   - `ems-vacuum-cumulative-once`
   - `ems-cleanup-5min-boost`

2. **Regulären Cleanup beibehalten**
   - Den normalen, stündlichen Cleanup nicht entfernen.
   - Autovacuum-Tuning und Retention-Funktion bleiben bestehen.

3. **Kurz abwarten und neu messen**
   - Backend-Health erneut prüfen.
   - Slow-Queries erneut prüfen.
   - Login/Auth-Fehler erneut prüfen.

4. **Falls weiterhin Timeouts auftreten**
   - Backend einmal kontrolliert neu starten.
   - Danach erneut `db_health` und `slow_queries` ausführen.

**Erwartetes Ergebnis:**
- Die akute Zusatzlast durch die Wartungsjobs fällt weg.
- Login und Seiten sollten wieder schneller reagieren.
- Danach sehen wir in den Messwerten, ob noch echte Abfrage- oder Index-Probleme übrig sind.