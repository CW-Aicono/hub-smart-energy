# Loxone WS-Worker Update v1.4 — Push-Kanal (Cloud → Miniserver)

**Was ist neu?**  
Ab v1.4 kann die AICONO-Cloud Werte (z. B. Arbitrage-Fahrplan, Peak-Event-Vorladen, CO₂-Fenster) direkt in Ihre Loxone-Miniserver schreiben — automatisch, ohne dass Sie etwas tun müssen. Die Werte werden zuerst in einer Warteschlange gesammelt und dann vom Worker über die bereits offene Loxone-Remote-Connect-Verbindung abgesetzt.

Für dieses Update müssen Sie nichts in Loxone Config ändern. Sie müssen nur die Worker-Container auf beiden Hetzner-Servern neu bauen und starten.

---

## Schritt-für-Schritt (auf JEDEM der 2 Server, mit Putty)

### 1. Auf den Server einloggen (Putty öffnen, wie gewohnt).

### 2. In das Worker-Verzeichnis wechseln:
```
cd /opt/loxone-ws-worker
```

### 3. Neuen Code aus dem Repo holen:
```
git pull
```
> Erwartete Ausgabe: „Fast-forward" oder „Already up to date". Falls Sie „Already up to date" sehen — Datei manuell aktualisieren (fragen Sie Lovable-Support).

### 4. Docker-Image neu bauen (dauert ca. 1–2 Min):
```
docker compose build --no-cache
```

### 5. Container neu starten:
```
docker compose up -d
```

### 6. Prüfen, dass alles läuft:
```
docker logs -f loxone-ws-worker-lovable --tail 50
```

**Sie sollten diese Zeile finden:**
```
[PendingWrites] aktiv: poll alle 5s (Cloud → Miniserver Push-Kanal)
```

Wenn ja: **fertig.** Sie können das Log mit `Strg + C` verlassen.

---

## Woran erkenne ich, dass ein Push funktioniert hat?

Im Log erscheint pro erfolgreichem Schreibvorgang eine Zeile wie:
```
[PendingWrites] 504F94A2BAA2 AICO_ArbitrageDispatch__1__TargetPowerKw=45.5 ok
```

## Was, wenn ein Push fehlschlägt?

Dann sehen Sie im Log:
```
[PendingWrites] 504F94A2BAA2 write failed: <Grund>
```
Häufige Ursachen:
- **„no active WS connection"**: Die Miniserver-Verbindung ist gerade unterbrochen — der Worker versucht es automatisch bis zu 3 Mal neu.
- **HTTP 401 / „bad credentials"**: Zugangsdaten passen nicht — bitte im Tenant unter Integrationen die Loxone-Zugangsdaten prüfen.

Zusätzlich sehen Sie im AICONO-Frontend unter **Super-Admin → Monitoring** die Historie fehlgeschlagener Pushes.

---

## Rollback (falls doch etwas nicht funktioniert)

```
cd /opt/loxone-ws-worker
git checkout HEAD~1
docker compose build --no-cache
docker compose up -d
```
