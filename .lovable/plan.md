# Plan: Zweiten Loxone-Worker für Live-Umgebung auf demselben Hetzner-Server einrichten

## Was wir bauen
Ein zweiter Docker-Container `loxone-ws-worker-live` parallel zum bestehenden `loxone-ws-worker` (Test). Beide laufen auf demselben Server, verbinden sich aber zu **unterschiedlichen Lovable-Cloud-Backends** (Test vs. Live).

## Was du brauchst (zeige ich dir Schritt für Schritt)

| Wert | Wo holen | Wofür |
|---|---|---|
| **SUPABASE_URL** der Live-Instanz | Live-AICONO-App → unten links Avatar → **„View Backend"** → oben rechts steht die Projekt-URL `https://<id>.supabase.co` | Sagt dem Worker, wohin er die Daten schickt |
| **GATEWAY_API_KEY** der Live-Instanz | Live-AICONO-App → **Einstellungen → Integrationen → Reiter API** → Feld **API-Key** kopieren | Damit sich der Worker beim Live-Backend authentifiziert |

> Wichtig: **Beide Werte müssen aus der LIVE-Umgebung stammen** (also aus deiner Produktiv-AICONO-App, NICHT aus dem Test-/Preview-System). Sonst landen die Daten in der falschen Datenbank.

## Anpassungen gegenüber dem bestehenden Test-Worker

Da beide Worker auf **demselben Server** laufen, müssen sich drei Dinge unterscheiden:

1. **Container-Name:** `loxone-ws-worker-live` (statt `loxone-ws-worker`)
2. **Arbeitsordner:** `/opt/loxone-ws-worker-live` (statt `/opt/loxone-ws-worker`) — damit Code und Konfiguration sauber getrennt sind
3. **Health-Port:** `8081:8080` (statt `8080:8080`) — Port 8080 ist bereits vom Test-Worker belegt

Alle anderen Dateien (`index.ts`, `package.json`, `Dockerfile`) sind identisch zum Test-Worker und werden 1:1 kopiert.

## Vorgehen (Implementierung später in Build-Modus)

Ich erweitere `docs/loxone-ws-worker/README.md` um einen neuen Abschnitt am Ende:

**„Anhang: Zweiten Worker für Live-Umgebung auf demselben Server einrichten"**

Inhalt:
- **Schritt L1:** Wo finde ich die Live-SUPABASE_URL (mit Screenshot-Beschreibung)
- **Schritt L2:** Wo finde ich den Live-GATEWAY_API_KEY
- **Schritt L3:** Neuen Ordner `/opt/loxone-ws-worker-live` anlegen
- **Schritt L4:** Die 4 Dateien aus dem Test-Ordner kopieren (`cp` Befehl, ein Block zum Copy-Pasten)
- **Schritt L5:** Docker-Image neu bauen unter eigenem Tag `loxone-ws-worker-live`
- **Schritt L6:** Container starten mit Port `8081:8080`, eigenem Namen, Live-Werten — vollständiger fertiger `docker run`-Block mit nur zwei klar markierten Platzhaltern `[HIER_LIVE_SUPABASE_URL]` und `[HIER_LIVE_API_KEY]`
- **Schritt L7:** Verifizieren: `docker ps` (beide Container sichtbar?), `curl http://localhost:8081/healthz`, Logs prüfen
- **Schritt L8:** In der Live-AICONO-App prüfen, dass unter **Einstellungen → Integrationen → Bridge-Worker** der neue Worker als „online" auftaucht und Events fließen

Keine Änderungen am Worker-Code selbst (`index.ts` etc.) nötig — der Worker ist bereits Mandanten-/Umgebungs-neutral, er folgt einfach den Env-Variablen.

## Was nicht in den Plan gehört (bewusst weggelassen)

- Kein Refactoring der bestehenden Anleitung — nur ein zusätzlicher Anhang
- Keine docker-compose-Datei — wir bleiben bei `docker run`, weil das die bestehende Anleitung auch nutzt
- Keine neuen Edge Functions, keine DB-Migrationen
