## Ziel

Sicherheitsmarge für den Loxone-WS-Worker herstellen, damit HTTP-Fallback nicht bei jedem einzelnen verspäteten Heartbeat kippt. Danach ist der Weg frei, den manuellen Kippschalter zu entfernen (separater späterer Schritt).

## Konfiguration

- **Heartbeat-Intervall Worker:** bleibt bei **300 s** (`BRIDGE_HEARTBEAT_MS=300000` auf Hetzner, keine Änderung).
- **Stale-Schwelle Cloud:** **900 s** (15 Min) — 3 verpasste Heartbeats bis Failover.
- **HTTP-Pull-Fallback:** 15 Min (konfigurierbar pro Integration). Deckt sich exakt mit der Stale-Schwelle ⇒ maximaler zusätzlicher Datenversatz beim Failover ≈ 0.

## Umsetzung (drei kleine Änderungen)

### 1. Stale-Schwelle in der DB setzen

Migration:

```sql
INSERT INTO public.system_settings (key, value)
VALUES ('loxone_ws_stale_threshold_seconds', '900')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### 2. UI-Hinweistext anpassen — `src/components/super-admin/WorkerControlsPanel.tsx`

- Info-Feld zur Stale-Schwelle: Empfehlung von aktuell „240–360 s" auf **„600–1200 s (Default 900 s)"** aktualisieren.
- Hinweis präzisieren: „Der Worker sendet alle 300 s einen Heartbeat. Werte unter 600 s führen zu unnötigem Failover-Flapping."

### 3. Intelligentes HTTP-Intervall an Stale-Schwelle koppeln — `supabase/functions/loxone-periodic-sync/index.ts`

Aktuell wird das Intervall bei aktivem Worker hart auf `max(30, konfiguriert)` Minuten gesetzt. Das ist zu grob, wenn die Stale-Schwelle 15 Min beträgt.

Änderung: Effektives Intervall = **konfiguriertes Intervall** (typ. 15 Min) unabhängig vom Worker-Status. Grund: die 15-Min-Runde kostet kaum IO (nur Tagessummen-Refresh, Live-Werte werden ohnehin in `loxone-api` durch `isWorkerPrimary()` übersprungen). So ist der Fallback beim Ausfall des Workers innerhalb einer HTTP-Runde da, nicht erst nach 30 Min.

*Alternative, falls IO-Sensitivität wichtiger ist als schnelle Recovery:* Bump auf 15 Min beibehalten, aber nicht auf 30 Min hochsetzen. → Bitte kurz bestätigen, welche Variante du willst.

## Was NICHT geändert wird

- Kippschalter „Worker als primäre Datenquelle" bleibt zunächst bestehen. Entfernung (früherer Punkt a) kommt als separater Schritt, sobald die neue Konfiguration ein paar Tage stabil läuft.
- `loxone-api` Skip-Logik (`isWorkerPrimary`) bleibt unverändert — sie profitiert automatisch von der neuen Stale-Schwelle.
- Worker-Code / `.env` auf Hetzner: keine Änderung nötig.

## Erwartetes Verhalten nach der Umstellung


| Szenario                                    | Verhalten                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Worker gesund (Heartbeat ≤ 900 s)           | WS liefert Live-Werte, HTTP schreibt keine Live-Daten, nur Tagessummen            |
| Einzelner verspäteter Heartbeat (300–900 s) | Kein Failover, WS bleibt primär                                                   |
| Worker fällt aus (> 900 s stille)           | Nächster HTTP-Pull (in ≤ 15 Min) übernimmt automatisch Live-Schreibpfad           |
| Worker kommt zurück                         | Nächster Heartbeat → automatisch wieder primär, HTTP springt zurück in Skip-Modus |


## Offene Frage

Welche Variante in Schritt 3?

- **(i)** Bump auf 30 Min entfernen, immer konfiguriertes Intervall (schnellere Recovery, minimal mehr IO).
- **(ii)** Bump auf 30 Min beibehalten (aktueller Stand, langsamere Recovery bei Worker-Ausfall).  
  
Antwort: wir machen Lösung (i): Bump auf 30 Min entfernen, immer konfiguriertes Intervall (schnellere Recovery, minimal mehr IO).