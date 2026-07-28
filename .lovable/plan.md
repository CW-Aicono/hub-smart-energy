## Was der Screenshot bestätigt

Der Miniserver Rathaus ist über den Loxone Cloud-DNS (`78-47-126-196.504f94a2baa2.dyndns.loxonecloud.com`) erreichbar, Loxone Web-UI und Loxone-App loggen sich problemlos ein. Beide nutzen ebenfalls WebSocket (`wss://…`) auf demselben Endpunkt, den auch unser Worker anspricht.

Das heißt:
- Der Miniserver ist WS-fähig.
- Cloud-DNS/Remote-Connect ist gesund.
- Freie Event-Slots sind vorhanden (sonst käme die App auch nicht rein).
- TLS/Zertifikat ist gesund.

Der Fehler liegt also **spezifisch bei unserem `loxone-ws-worker` gegen genau diesen Miniserver**, nicht bei Loxone.

## Was die Datenbank für Rathaus zeigt

Aus `bridge_event_log` (Serial `504F94A2BAA2`) seit dem Reboot:

- Serie von `ws-open`-Fehlern:
  - `read ECONNRESET`
  - `Request failed with status code 503`
  - `Request failed with status code 423`
  - vereinzelt leere Fehlergründe
- Zuletzt erfolgreiche Session endete mit `close-2008` nach 15 Reconnects in 21 Minuten
- Davor `close-2004` mit 83 Reconnects
- Danach kommt es zu keinem stabilen neuen WS-Open mehr

`423 Locked` und `503` in Verbindung mit direkt darauffolgenden Retry-Wellen sind typisch für **Rate-Limiting/Locking auf Loxone-Cloud-Relay-Ebene**, wenn ein Client zu häufig hintereinander connectet. Das erklärt, warum App/Web-UI durchkommen (einzelner, sauberer Connect) und unser Worker nicht (aggressiver Reconnect-Storm → Sperre).

## Hypothese

Unser Worker rennt für Rathaus in eine **Reconnect-/Sperrschleife**:

1. Miniserver oder Cloud-Relay schließt eine WS-Verbindung (`2004`/`2008`).
2. Worker versucht sofort wieder aufzubauen.
3. Loxone-Cloud-Relay antwortet mit `423`/`503`, weil der Endpunkt/Client kurzfristig gesperrt/überlastet ist.
4. Worker retryt weiter, Sperre bleibt aktiv, WS-Open kommt nie zustande.
5. HTTP-Poll läuft separat weiter, deswegen sehen wir „irgendwelche" Werte, aber der WS-Kanal bleibt tot.

App/Web-UI sind davon nicht betroffen, weil sie
- nicht permanent reconnecten,
- vom Nutzer manuell gestartet werden,
- vermutlich einen anderen Login-Kontext haben.

## Plan zur Diagnose und Behebung

### 1. Sofort: Rathaus-WS für kurzen Zeitraum bewusst pausieren
- `location_integrations.loxone_remote_connect_ws_enabled = false` für die betroffene Integration (`284a957b-…`).
- 10 Minuten warten, damit eine eventuelle Loxone-Cloud-Sperre abläuft.
- Danach WS wieder aktivieren und einen **einzigen** Connect zulassen.
- Ziel: prüfen, ob der Worker nach „kalter" Pause sauber connecten kann.

### 2. Worker-Reconnect-Verhalten härten (Patch für `loxone-ws-worker`)
Aktuell reagiert der Worker auf `close-2004`/`close-2008`/`423`/`503` mit dem normalen Reconnect-Backoff. Notwendig:

- Bei HTTP-Response `423 Locked` oder `503` im `ws-open`-Schritt: **Cool-down von 5–10 Minuten** für genau diese Integration, kein Retry-Storm.
- Bei `close-2004`/`close-2008` in kurzer Folge (z. B. >3 in 10 min): Exponentielles Backoff auf mindestens 60 s, dann 5 min, dann 15 min.
- Pro Integration einen eigenen Backoff-Zustand (nicht global, damit gesunde Miniserver nicht mitleiden).
- Alle Cool-downs in `bridge_event_log` (`event_type=ws_cooldown`) sichtbar machen.

### 3. Login-Kontext prüfen
Loxone kann pro User nur begrenzt viele parallele WS-Sessions/Slots. Prüfen:

- Welchen Loxone-User verwendet unser Worker für Rathaus? (aus `credentials_encrypted` / Integration-Config)
- Wird derselbe User evtl. schon von einer anderen Integration/altem Container/Loxone Config genutzt?
- Falls ja: **eigenen technischen User** „aicono-worker" im Miniserver anlegen, mit reduzierten Rechten und **nur** für den Worker.

### 4. Duplikat-Integrationen aufräumen
Für Serial `504F94A2BAA2` gibt es **vier** `location_integrations`. Vier parallele WS-Sessions auf denselben Miniserver ist Teil des Problems:
- Slot-Verbrauch am Miniserver
- Vervierfachte Reconnect-Storms
- Loxone-Cloud sieht 4x denselben Client kurz hintereinander → schneller in `423`

Nur eine Integration behalten, die anderen drei deaktivieren. (Ich liste dir vorher die vier auf, damit du entscheidest.)

### 5. Direkte LAN/VPN-Verbindung als Diagnose-Gegenprobe
- Falls möglich, testweise `host` in der Integration auf die LAN-IP setzen und Cloud-DNS umgehen.
- Bleibt der WS dann stabil, ist die Diagnose eindeutig: Loxone-Cloud-Relay drosselt unseren Worker.

### 6. UI-Klarstellung
In der Flotten-Ansicht klar zwischen
- „WS-Kanal offline"
- „HTTP-Poll aktiv"
- „letzter WS-Cool-down bis …"

trennen, damit Situationen wie diese nicht mehr als „WS getrennt, aber Daten kommen" verwirren.

## Empfehlung für den nächsten Schritt

Nicht am Miniserver herumdrehen — er ist gesund. Ich würde als nächstes:

1. Dir die 4 Duplikat-Integrationen für Rathaus auflisten, damit du drei davon abschaltest.
2. Danach den Cool-down-Patch für den Worker vorbereiten, damit sich das Problem nach dem nächsten Reboot/Firmware-Update nicht wiederholt.