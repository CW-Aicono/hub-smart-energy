# Worker-Update v1.10 — Live-Broadcast ohne Datenbank-Schreiblast

**Datum:** 31.07.2026
**Betrifft:** `loxone-ws-worker` auf dem Hetzner-Server
**Ziel:** Live-Werte (Energiefluss-Monitor, Seite „Aktuelle Werte", Gerätekacheln/Steuerungen) kommen wieder in Echtzeit über WebSocket — ohne dass die Datenbank-Last steigt.

---

## Was war das Problem?

Bei der IO-Optimierung (v1.6) wurde der Live-Pfad komplett abgeschaltet:

- Die Funktion `flush()` begann mit einem sofortigen `return;`.
- Der zugehörige Timer war auskommentiert.

Der Live-Kanal der Oberfläche (`loxone-live-<tenant>`) wird aber genau von dieser Funktion beliefert. Ergebnis: Es kamen gar keine Echtzeit-Werte mehr an. Die Oberfläche zeigte stattdessen den jüngsten Datenbank-Eintrag — bei vielen Zählern ein bis zu 15 Minuten alter HTTP-Abruf. Daher z. B. „-77,7 kW" statt der realen -31,2 kW.

## Was ändert v1.10?

Der Live-Push ist wieder aktiv, aber **strikt getrennt** von der Speicherung:

| Pfad | Intervall | Datenbank |
|---|---|---|
| Live-Broadcast (neu aktiv) | alle 5 Sekunden | **keine Schreibvorgänge** |
| 5-Minuten-Buckets (unverändert) | alle 60 Sekunden geprüft | wie bisher |

Technisch: Der Worker sendet `live_only: true` an `gateway-ingest?action=bridge-readings`. Die Cloud-Funktion verteilt die Werte dann nur über den Realtime-Kanal und schreibt weder in `bridge_raw_samples` noch in `energy_storages`. Zusätzlich werden die beiden Lookup-Abfragen (Worker + Miniserver-Verknüpfung) 5 Minuten lang zwischengespeichert, damit auch keine Lese-Last entsteht.

Weitere Schutzmechanismen:

- Nur senden bei Änderung ≥ 0,05 kW (Leistung), sonst höchstens alle 60 s ein Keepalive-Wert je Zähler.
- Maximal 500 Ereignisse pro Push-Zyklus (Rest folgt im nächsten Zyklus).
- Der bestehende Kill-Switch pausiert auch den Live-Push.

## Neue Einstellungen (optional)

In der `.env` des Workers:

```
LIVE_PUSH_INTERVAL_MS=5000        # Push-Takt (Minimum 2000)
MIN_DELTA=0.05                    # Mindeständerung in kW
MIN_PUSH_INTERVAL_MS=60000        # Keepalive je Zähler
MAX_LIVE_EVENTS_PER_PUSH=500      # Obergrenze je Zyklus
```

Ohne Einträge gelten diese Standardwerte automatisch.

## Update durchführen

1. Auf dem Hetzner-Server anmelden.
2. In das Worker-Verzeichnis wechseln (dort, wo die `docker-compose.yml` des Workers liegt).
3. Neue `index.ts` aus diesem Repository übernehmen (`docs/loxone-ws-worker/index.ts`).
4. Neu bauen und starten:

```
docker compose build loxone-ws-worker
docker compose up -d loxone-ws-worker
```

5. Logs prüfen — erwartet wird kurz nach dem Start:

```
[Live-Push] aktiv: alle 5s Broadcast (live_only, MIN_DELTA=0.05 kW, Keepalive 60s)
[Live] 37 Werte per Broadcast gepusht (live_only)
```

## Kontrolle nach dem Update

1. Seite „Aktuelle Werte" öffnen: Die Werte müssen sich im Sekundentakt bewegen.
2. Energiefluss-Monitor: Erzeugung/Bezug reagieren unmittelbar.
3. Datenbank-Gesundheit vor und nach dem Update vergleichen — die Schreiblast darf sich **nicht** verändern. Sollte sie steigen, wurde `live_only` nicht übernommen (dann läuft noch eine alte Worker-Version).

## Zurückrollen

Falls nötig, genügt es, den Live-Push abzuschalten, ohne die Version zu wechseln:

```
LIVE_PUSH_INTERVAL_MS=999999999
```

anschließend `docker compose up -d loxone-ws-worker`. Die Historisierung läuft davon unabhängig weiter.
