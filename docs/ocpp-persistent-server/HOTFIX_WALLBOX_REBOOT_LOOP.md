# Hotfix: Wallbox-Reboot-Loop (Test + Live)

> ## ⚡ Nachtrag 2 (05.06.2026) — die eigentliche Ursache
>
> Der Vergleich mit dem Monta-Backend hat gezeigt: die Wallbe
> `Smart Charge Control` mit Firmware **BF-01.04.20** rebootet alle ~10 Minuten,
> wenn der Server in der `BootNotification`-Antwort einen kleinen
> Heartbeat-`interval` schickt (wir hatten `30`). Monta antwortet mit
> **`interval: 86400`** (= 24 h) und dieselbe Wallbox läuft stabil, lädt und
> rebootet nicht mehr.
>
> **Fix:** In `src/ocppHandler.ts` (Case `BootNotification`) ist `interval` jetzt
> fest auf `86400` gesetzt. Für alle anderen Modelle ist das harmlos —
> `interval` ist nur die Obergrenze, eine Wallbox sendet bei Bedarf jederzeit
> früher Heartbeats.
>
> **Aktion auf dem Server:** Genau dieselben Schritte wie unten in **Schritt 4
> und 5** ausführen (Test und Live je einmal `stop` → `build --no-cache` →
> `up -d`). Danach in den Logs für die Wallbe prüfen: nach einer einzigen
> Boot-Sequenz darf **keine** weitere `BootNotification` mehr alle 10 Minuten
> auftauchen.

---



## Was war das Problem?

Nach dem Live-Update vom 03.06.2026 starteten die wallbe Smart Charge Control
(Firmware BF-01.04.20) alle ca. 10 Minuten neu. Ursache: Der OCPP-Server hat
**bei jedem `BootNotification`** die Wallbox-Konfiguration neu gesetzt
(`MeterValueSampleInterval`, `ClockAlignedDataInterval`,
`MeterValuesSampledData`). Ältere wallbe-Firmware antwortet darauf mit
`RebootRequired` und startet sich tatsächlich neu → daraus wird ein endloser
Boot-Loop.

## Was ist gefixt?

1. Der Server prüft jetzt **vor jeder Änderung**, ob der Sollwert bereits
   gesetzt ist. Wenn ja → kein `ChangeConfiguration` mehr.
2. War der Probe-Lauf in den letzten 24 h schon erfolgreich, wird er
   komplett übersprungen.
3. Read-only-Keys werden respektiert.

Die Cloud-Edge-Function `ocpp-persistent-api` wurde bereits aktualisiert
(neue Action `get-capabilities-age`).

---

## Übersicht der beiden Umgebungen

Auf dem Hetzner-Server laufen **zwei** OCPP-Server parallel — beide müssen
aktualisiert werden, damit auch Test-Wallboxen sauber laufen:

| Umgebung | Domain | Service-Name | Container-Name |
|---|---|---|---|
| **Test** | `ocpp.aicono.org` | `ocpp` | `ocpp-server` |
| **Live** | `cp.aicono.org` | `ocpp-live` | `ocpp-server-live` |

> ⚠ **Wichtig:** Niemals `docker compose down` eingeben — das würde
> beide Umgebungen **und** den Caddy-Proxy gleichzeitig stoppen.

---

## Schritt 1 — Per SSH einloggen

```bash
ssh root@DEINE-SERVER-IP
```

Erwartet: Eingabeaufforderung wie `root@OCPP-server:~#`.

## Schritt 2 — In den Projektordner wechseln

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server
```

## Schritt 3 — Container prüfen

```bash
docker compose ps
```

Du musst genau diese drei Container sehen — alle mit `Up` bzw. `healthy`:

```
ocpp-caddy         ...   Up ...
ocpp-server        ...   Up ... (healthy)
ocpp-server-live   ...   Up ... (healthy)
```

Wenn das passt → weiter mit Schritt 4.

## Schritt 4 — Neuesten Code holen

```bash
git fetch --all
git pull
```

Erwartet: Geänderte Dateien u. a.:

```
docs/ocpp-persistent-server/src/configurationProbe.ts
docs/ocpp-persistent-server/src/backendApi.ts
docs/ocpp-persistent-server/HOTFIX_WALLBOX_REBOOT_LOOP.md
```

Falls du den Fehler `Your local changes … would be overwritten` bekommst:

```bash
git stash
git pull
git stash pop
```

---

## Schritt 5 — Beide Container neu bauen und starten

> **Reihenfolge:** Erst **Test** updaten (ungefährlich), dann **Live**.
> Bei Live entstehen kurz (~30–60 s) Verbindungsabbrüche bei echten Wallboxen
> — daher Live nur zu ruhigen Zeiten updaten.

### 5A — Test-Umgebung (`ocpp.aicono.org`)

Drei Befehle **einzeln** nacheinander, jeweils Enter abwarten:

```bash
docker compose stop ocpp
```

```bash
docker compose build --no-cache ocpp
```

(dauert 1–3 Minuten)

```bash
docker compose up -d ocpp
```

Erwartet am Ende:

```
✔ Container ocpp-server  Started
```

### 5B — Live-Umgebung (`cp.aicono.org`)

Wieder drei Befehle einzeln:

```bash
docker compose stop ocpp-live
```

```bash
docker compose build --no-cache ocpp-live
```

```bash
docker compose up -d ocpp-live
```

Erwartet am Ende:

```
✔ Container ocpp-server-live  Started
```

---

## Schritt 6 — Logs prüfen

### Test-Container:

```bash
docker logs -f ocpp-server
```

### Live-Container (zweites Terminal-Fenster bzw. nach `Strg + C`):

```bash
docker logs -f ocpp-server-live
```

Was du **sehen solltest**, sobald Wallboxen sich neu verbinden:

```
Skipping config probe (recently probed)
```

oder beim allerersten Lauf:

```
Config key already at desired value, skipping
MeterValuesSampledData already matches profile, no change
```

Was du **NICHT mehr sehen darfst** (nach dem ersten Lauf):

```
MeterValuesSampledData accepted          ← bei jedem Boot
ChangeConfiguration returned RebootRequired
```

Mit `Strg + C` beendest du das Log-Mitlesen (Container läuft weiter).

---

## Schritt 7 — Health-Checks

```bash
curl https://ocpp.aicono.org/health
```

```bash
curl https://cp.aicono.org/health
```

Beide müssen jeweils so antworten:

```json
{"status":"ok","uptimeSeconds":12,"sessions":0}
```

## Schritt 8 — Wallboxen prüfen

In der App `https://ems-pro.aicono.org` → Standort → Ladepunkte:
Beide Live-Wallboxen sollten innerhalb von 1–2 Minuten online gehen und
**dauerhaft** online bleiben (Heartbeat alle ~30 s, keine 10-Minuten-Lücken
mehr).

---

## Wenn es nach Schritt 8 immer noch reboots gibt

Beim **allerersten** Verbinden nach dem Update ist genau **ein** Reboot pro
Wallbox normal (falls ein Sollwert tatsächlich abweicht). Danach muss Ruhe
sein. Bei anhaltenden Reboots: Logs aus Schritt 6 sammeln und melden —
bitte **nicht** dieselben Schritte mehrfach wiederholen.
