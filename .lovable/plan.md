Der Deploy ist erneut an derselben Stelle gescheitert, weil die Reparatur-Migration zwar existiert, aber vom Dateinamen her zu spät kommt:

- Fehler-Migration: `20260508145707_...sql`
- Reparatur-Migration: `20260511220315_...sql`

Das Deploy-Script arbeitet Migrationen streng nach Dateiname/Zeitstempel ab. Deshalb versucht der Server zuerst die fehlerhafte Migration vom 08.05. auszuführen und kommt gar nicht bis zur Reparatur vom 11.05.

## Plan

1. **Neue frühere Reparatur-Migration anlegen**
   - Ich lege dieselbe Reparatur zusätzlich mit einem Zeitstempel direkt vor der fehlerhaften Migration an, z. B.:
     `20260508145600_repair_sales_recommended_devices_distribution.sql`
   - Dadurch läuft sie beim nächsten Deploy automatisch vor `20260508145707_...sql`.

2. **Bestehende späte Reparatur entschärfen**
   - Die vorhandene Datei `20260511220315_...sql` lasse ich entweder als harmloses No-Op bestehen oder entferne sie, damit nichts doppelt/unnötig läuft.
   - Sicherer ist: bestehende Datei entfernen oder als Kommentar-No-Op ersetzen, damit die Cloud/Prod-Migrationen sauber bleiben.

3. **Optional: Auto-Heal im Deploy-Script verbessern**
   - Das Script erkennt aktuell nur bestimmte Formen von „Spalte fehlt“.
   - Dieser Fehler lautet aber nur `column "distribution_id" does not exist`, daher greift Auto-Heal nicht.
   - Ich ergänze die Erkennung für genau dieses Muster, damit ähnliche Fälle künftig automatisch geheilt werden.

## Ergebnis für dich

Danach musst du nur nochmal in GitHub Actions den Deploy starten. Der Server zieht erst die fehlende Spalte nach und führt dann die eigentliche Migration aus.