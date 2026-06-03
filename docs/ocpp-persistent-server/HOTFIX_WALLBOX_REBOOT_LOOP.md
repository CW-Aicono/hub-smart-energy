# Hotfix: Wallbox-Reboot-Loop (Live, `cp.aicono.org`)

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

## Schritt-für-Schritt: Update auf dem Hetzner-Live-Server

### Schritt 1 — Per SSH einloggen

Auf deinem Rechner ein Terminal öffnen und einloggen. Ersetze
`DEINE-SERVER-IP` mit der IP deines Live-Servers:

```bash
ssh root@DEINE-SERVER-IP
```

Erwartetes Ergebnis: Du bist als `root` eingeloggt und siehst eine
Eingabeaufforderung wie `root@aicono-live:~#`.

### Schritt 2 — In das richtige Verzeichnis wechseln

```bash
cd /opt/aicono/aicono-ems/docs/ocpp-persistent-server
```

Falls der Pfad bei dir anders ist, finde ihn so:

```bash
find / -path "*ocpp-persistent-server/docker-compose.yml" 2>/dev/null
```

### Schritt 3 — Sicherheits-Check: Bist du im Live-Container?

```bash
docker compose ps
```

Du musst einen Container mit Namen `cp-server` (oder `ocpp-server` mit Bezug
auf `cp.aicono.org`) sehen. **Wenn dort `ocpp-server` mit `ocpp.aicono.org`
steht, abbrechen** — das wäre der Test-Container.

### Schritt 4 — Neuesten Code holen

```bash
git fetch --all
git pull
```

Erwartetes Ergebnis: U. a. diese geänderten Dateien:

```
docs/ocpp-persistent-server/src/configurationProbe.ts
docs/ocpp-persistent-server/src/backendApi.ts
docs/ocpp-persistent-server/HOTFIX_WALLBOX_REBOOT_LOOP.md   (NEU)
```

### Schritt 5 — Container neu bauen und starten

```bash
docker compose build --no-cache cp-server && docker compose up -d cp-server
```

(Falls dein Service in der `docker-compose.yml` anders heißt, ersetze
`cp-server` mit dem korrekten Namen aus Schritt 3.)

Erwartetes Ergebnis: Der Container wird neu gebaut (ca. 1–2 Minuten) und
startet anschließend wieder.

### Schritt 6 — Logs live mitlesen

```bash
docker logs -f cp-server
```

Was du **sehen solltest**, sobald die Wallboxen sich neu verbinden:

```
Skipping config probe (recently probed)   ← bei jedem Folge-Boot
```

oder beim ersten Lauf:

```
Config key already at desired value, skipping
MeterValuesSampledData already matches profile, no change
```

Was du **NICHT mehr sehen solltest**:

```
MeterValuesSampledData accepted    ← jedes Mal nach BootNotification
ChangeConfiguration returned RebootRequired
```

Mit `Strg + C` beendest du das Log-Mitlesen (der Container läuft weiter).

### Schritt 7 — Wallboxen kurz prüfen

In der App `https://ems-pro.aicono.org` → Standort → Ladepunkte:
Beide Wallboxen sollten innerhalb von 1–2 Minuten online gehen und
**dauerhaft** online bleiben (Heartbeat alle ~30 s, keine 10-Minuten-Lücken
mehr).

---

## Wenn es nach Schritt 7 immer noch reboots gibt

Dann ist der Probe-Lauf für diese Wallboxen noch nicht in
`charge_point_capabilities` eingetragen (TTL leer). Einmaliges manuelles
Anstoßen reicht — nach dem ersten erfolgreichen Lauf greift die 24 h-TTL.

Falls eine Wallbox einen `RebootRequired` zurückmeldet **weil ein Wert
tatsächlich abweicht**, ist genau **ein** letzter Reboot normal. Danach ist
Ruhe.

Bei anhaltenden Reboots: Logs sammeln und melden — bitte **nicht** versuchen,
die Test-Schritte zu wiederholen, das bringt nichts.
