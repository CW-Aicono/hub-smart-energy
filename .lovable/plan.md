# AICONO EMS Add-on: Restart-Loop durch PIN-Schutz

## Ursache (sicher identifiziert)

In `docs/ha-addon/config.yaml` ist der Supervisor-Watchdog konfiguriert auf:

```
watchdog: "http://[HOST]:[PORT:8099]/api/status"
```

Der Supervisor ruft diese URL **ohne Session-Cookie** auf. In `docs/ha-addon/index.ts` (Zeilen 2359-2367) gibt es jedoch einen globalen Auth-Gate, der **alle** `/api/*`-Routen außer `/api/version` blockt, sobald ein UI-PIN gesetzt ist:

```ts
if (uiPinHash && !isSessionValid(req)) {
  if (pathname !== "/api/version") {
    res.writeHead(401, ...);  // ← Watchdog bekommt 401
    return;
  }
}
```

Folge:
1. Supervisor-Watchdog ruft `/api/status` → bekommt **401**
2. Watchdog wertet das als „App failed" → `restarting...`
3. Beim Neustart kollidiert der Restart mit dem laufenden Stop-Job → `"Another job is running for job group addon_..."`
4. `Stream error ... Cannot write to closing transport` – der HTTP-Server wird mitten in einer Antwort beendet
5. Endlosschleife alle paar Minuten

Die Logzeilen `Home Assistant WebSocket API closed` + `Watchdog found app ... is failed` direkt hintereinander passen exakt zu diesem Muster.

## Fix

`/api/status` und `/api/auth-status` aus dem PIN-Gate ausnehmen — beide sind reine Health/Status-Endpoints ohne sensible Daten und werden vom Supervisor (Watchdog) bzw. der Login-UI selbst aufgerufen.

### Änderung in `docs/ha-addon/index.ts` (~Zeile 2362)

```ts
if (uiPinHash && !isSessionValid(req)) {
  // Health-/Status-Endpoints für Supervisor-Watchdog & UI-Login freigeben
  const publicPaths = new Set(["/api/version", "/api/status", "/api/auth-status"]);
  if (!publicPaths.has(pathname)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized", pin_required: true }));
    return;
  }
}
```

Optional härten: `/api/status` zusätzlich auf Aufrufe vom Supervisor-Subnetz (172.30.32.0/23) beschränken, falls ein Schutz vor LAN-Zugriff gewünscht ist – für Health-Daten aber unkritisch.

### Sofort-Workaround für den Anwender (ohne Update)

Falls der Hub gerade gar nicht startet:
1. HA → **Einstellungen → Add-ons → AICONO EMS Gateway → Konfiguration**
2. PIN-Hash temporär entfernen (Add-on-Optionen) **oder** Watchdog deaktivieren (Tab „Info" → „Watchdog" aus)
3. Add-on starten, anschließend Update einspielen, danach Watchdog/PIN wieder aktivieren

## Memory-Update (nach Approval)

Eintrag in `mem://features/gateways/aicono-ems-pin-protection` ergänzen:
> Watchdog-Endpoints (`/api/status`, `/api/version`, `/api/auth-status`) müssen am PIN-Gate vorbeigeleitet werden – sonst Restart-Loop durch Supervisor.
