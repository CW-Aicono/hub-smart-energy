# Hetzner-Update — Simulator v1.1 (Iteration A + B)

> Dauer: ca. 5 Minuten. Du brauchst nur SSH-Zugang zu deinem Hetzner-Server.

## Was sich ändert

Der Simulator-Container bekommt neue Funktionen:
- Konfigurierbare Ladeleistung (3.7 / 11 / 22 / 50 / 150 kW)
- Live-Steuerung: Slider, Pause/Resume, Stecker ziehen
- Echte idTags aus deinen Lade-Usern
- Fehlersimulation (8 OCPP-Fehlercodes)
- Live-OCPP-Logs (letzte 50 Nachrichten)

**Ohne dieses Update funktionieren die neuen Buttons in der UI nicht** — sie schicken die neuen Aktionen, der alte Container kennt sie aber noch nicht.

---

## Schritt 1 — SSH zum Server

```bash
ssh root@<deine-hetzner-ip>
```

## Schritt 2 — Ins Container-Verzeichnis wechseln

```bash
cd /opt/ocpp-simulator
```

(Falls dein Pfad anders heißt, dort hin wechseln. Das Verzeichnis enthält die `docker-compose.yml`.)

## Schritt 3 — Aktuellen Code holen

**Variante A — falls du `git` nutzt:**
```bash
git pull
```

**Variante B — falls du den Code manuell deployst:**
Lade die Datei `docs/ocpp-simulator-server/src/index.ts` aus deinem Lovable-Projekt herunter und ersetze damit `/opt/ocpp-simulator/src/index.ts` auf dem Server. Z. B. via `scp`:

```bash
# Vom lokalen Rechner aus:
scp src/index.ts root@<deine-hetzner-ip>:/opt/ocpp-simulator/src/index.ts
```

## Schritt 4 — Container neu bauen + starten

```bash
docker compose up -d --build ocpp-simulator
```

Dauert ca. 60–90 Sekunden (TypeScript-Kompilierung im Container).

## Schritt 5 — Healthcheck

```bash
curl http://127.0.0.1:8090/health
```

Erwartete Antwort:
```json
{"ok":true,"instances":0,"version":"1.1.0"}
```

✅ Wenn `version` jetzt `1.1.0` zeigt, war das Update erfolgreich.

## Schritt 6 — Test in Lovable

1. Öffne im Super-Admin → Wallbox-Simulator
2. Lösche ggf. alte Simulator-Instanzen (die kennen die neuen Felder noch nicht)
3. Klick „Simulator starten"
4. Wähle einen Tenant, eine Ladeleistung (z. B. 22 kW), optional einen Lade-User
5. Nach Start → klick „Laden" → Zähler steigt jetzt mit der gewählten kW
6. Klick auf das Logbuch-Icon (📜) → OCPP-Logs werden live angezeigt
7. Test Pause / Resume / Stecker / Fehlersimulation

## Troubleshooting

**Healthcheck zeigt noch `version: "1.0.0"` (oder gar keine version):**
- `docker compose logs --tail 50 ocpp-simulator` ansehen
- Build-Fehler? Häufig wegen `node_modules`-Cache → einmal `docker compose build --no-cache ocpp-simulator && docker compose up -d ocpp-simulator`

**„Instance not found" beim Klick auf Logs:**
- Alte Sim-Instanzen (vor dem Update gestartet) kennt der neue Container nicht. Lösche sie in der UI und starte neue.

**Buttons schicken Aktion, aber nichts passiert:**
- Container-Logs prüfen: `docker logs --tail 100 ocpp-simulator`
- Erwartet sind Zeilen wie `OCPP -> server StatusNotification` mit dem entsprechenden Status.
