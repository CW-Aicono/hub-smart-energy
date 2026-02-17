
## Permanentes Server-Polling für Loxone-Leistungsdaten

### Ursache

Das Tages-Verlaufschart zeigt Lücken, weil die `meter_power_readings`-Tabelle aktuell nur dann befüllt wird, wenn ein Browser die App geöffnet hat. Der React-Code ruft alle 5 Minuten über die `loxone-api`-Funktion das Gateway ab, und diese Funktion schreibt dabei die Momentanwerte in die Datenbank. Sobald niemand die App nutzt, gibt es kein Polling und keine Datenpunkte.

Es gibt zwar bereits `pg_cron` und `pg_net` in der Datenbank sowie laufende Cron-Jobs (für BrightHub), aber keinen Job für die Loxone-Datensicherung.

### Lösung

Einen neuen automatischen Hintergrundprozess einrichten, der alle 5 Minuten serverseitig Loxone-Daten abruft und sichert – unabhängig davon, ob jemand die App geöffnet hat.

#### Schritt 1: Neue Edge Function `loxone-periodic-sync`

Eine neue, schlanke Edge Function wird erstellt, die:

1. Alle aktiven Loxone-Integrationen aus der Datenbank liest (Tabelle `location_integrations` mit `integration_type = 'loxone'`)
2. Für jede Integration die `getSensors`-Logik der bestehenden `loxone-api`-Funktion aufruft (welche bereits intern Leistungswerte in `meter_power_readings` schreibt)
3. Ohne Benutzerauthentifizierung lauffähig ist (Service-Role-Key)

Die bestehende `loxone-api`-Funktion enthält bereits die gesamte Logik zum Abrufen der Sensordaten und zum Schreiben in `meter_power_readings`. Die neue Funktion ist nur ein Orchestrator, der alle Integrationen sequentiell aufruft.

#### Schritt 2: Cron-Job via Migration

Ein neuer `pg_cron`-Job wird angelegt, der die neue Funktion alle 5 Minuten aufruft:

```sql
SELECT cron.schedule(
  'loxone-power-readings-sync',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://xnveugycurplszevdxtw.supabase.co/functions/v1/loxone-periodic-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <service_role_key>"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

### Technische Details

**Betroffene Dateien:**
- Neu: `supabase/functions/loxone-periodic-sync/index.ts`
- Neu: Datenbank-Migration für den Cron-Job

**Datenfluss nach der Änderung:**

```text
pg_cron (alle 5 Min)
    └── loxone-periodic-sync (Edge Function)
          └── liest alle aktiven Loxone-Integrationen aus DB
                └── ruft für jede Integration loxone-api auf (getSensors)
                      └── loxone-api schreibt meter_power_readings ──> Tages-Chart
```

**Kein Datenverlust, keine Breaking Changes:**
- Die bestehende Client-seitige Polling-Logik bleibt unverändert – sie liefert weiterhin Live-Werte für die UI
- Die neue Hintergrundprozess schreibt dieselbe Tabelle, erzeugt also konsistente Datenpunkte
- Duplikate sind kein Problem, da das Chart Datenpunkte pro Zeitfenster aggregiert

**Lücken in der Vergangenheit:**
Vergangene Datenlücken (z. B. heute früh 3:00–7:00 Uhr) können nicht rückwirkend befüllt werden, da der Loxone Miniserver keine historischen Momentanwerte liefert (nur aggregierte Tages-/Wochen-/Monatswerte). Ab Einrichtung des Cron-Jobs ist der Verlauf lückenlos.
