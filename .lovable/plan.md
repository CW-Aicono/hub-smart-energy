
## Neuer Befund (jetzt gerade aus der DB)

Du hast die WS-Integration vor ~15 Min pausiert und gerade wieder aktiviert. Das ist der Reality-Check für meine vorherige „Cloud-Rate-Limit"-Hypothese — und er ist **negativ ausgefallen**:

- **26 Verbindungsversuche in den letzten 30 Min für Rathaus**, alle mit `stage=ws-open: Request failed with status code 408`.
- Die Fehler laufen **nach** deiner Pause + Re-Enable in exakt gleichem Muster weiter — kein einziger erfolgreicher Handshake.
- Retry-Abstand liegt bei ~60–90 s (Backoff-Cap). Also aktuell **kein** Reconnect-Storm; der Worker verhält sich brav.
- `loxone_ws_session_log` für diese Integration ist **leer** — der ws-open kommt gar nicht bis zum Punkt, an dem eine Session eröffnet würde.
- **Keine** 423/503-Antworten. Nur reine 408 Request Timeout auf dem HTTP-Upgrade-Handshake.

### Was das ausschließt

- **Cloud-Rate-Limit / 423-Lockout**: Wenn Loxone-Cloud uns sperren würde, käme jetzt 423/503. Kommt nicht. Die 15-Min-Pause hat auch nichts freigegeben — weil nichts gesperrt war.
- **Aggressive Reconnect-Schleife im Worker**: 60 s Abstand ist bereits konform. Der geplante 423/503-Cool-down-Patch würde an diesem konkreten Fehler **nichts** ändern.
- **Miniserver-Firmware / Cloud-DNS generell tot**: App/Web-UI/Loxone Config kommen durch → Cloud-DNS und Miniserver antworten.

### Was übrig bleibt (jetzt die realistischen Kandidaten)

Alle drei brauchen gezielte Verifikation, keine Bau-Maßnahme im Blindflug:

1. **Login-/Session-Slot-Kollision auf Loxone-Cloud-Ebene für diesen einen User.** Loxone-Cloud vergibt pro User/Miniserver begrenzte gleichzeitige Session-Slots. Wenn App + Web-UI + Loxone Config denselben User verwenden wie unser Worker, kann der Worker beim Handshake in ein 408 laufen, während die interaktiven Clients laufen. Verifikation: welcher User steht in `location_integrations.config` für Rathaus, und ist es derselbe wie in App/Web-UI?
2. **Stale/falsche Credentials in genau dieser Integration** (Passwort vor Firmware-Update im Miniserver rotiert, aber nicht in Cloud-Config). 408 statt 401 wäre ungewöhnlich, aber lxcommunicator hat auffälliges Fehler-Mapping — muss geprüft werden.
3. **Cloud-DNS-Route für Rathaus zeigt aus Sicht des Hetzner-Workers auf einen Endpoint, der bei ihm dauerhaft in 408 läuft** (Network-Path-Problem Hetzner ↔ Loxone-Cloud-Relay für diesen einen Serial). Verifikation: Container-Log mit `[WS] verbinde 504F94A2BAA2 → <host>` → welcher Host wird tatsächlich verwendet?

## Vorschlag für den nächsten Schritt (statt sofort Code zu bauen)

### Schritt A — Fakten aus der Integration ziehen (2 Min, nur DB-Lesen, kein Code)

Ich lese aus `location_integrations` für Rathaus:
- Den konfigurierten Host (Cloud-DNS-Endpoint), den der Worker anspricht.
- Den Benutzernamen (Passwort natürlich nicht).
- Vergleich mit den anderen 3 gesunden Miniservern: gleiche Struktur? gleiche Art von Host? Gleicher User-Pattern?

### Schritt B — Ein sauberer Worker-Log-Ausschnitt vom Hetzner-Container

Bitte per Putty:

```bash
docker logs --tail 200 loxone-ws-worker 2>&1 | grep -E "504F94A2BAA2|Rathaus" | tail -40
```

Ich brauche:
- Die Zeile `[WS] verbinde 504F94A2BAA2 → <host>` (zeigt den tatsächlich verwendeten Endpoint)
- Optional die Zeile mit `describeError` vor dem 408 (zeigt, ob Loxone-Cloud selbst antwortet oder ob es ein TCP-/TLS-Timeout ist)

### Schritt C — Nur wenn A + B nichts eindeutiges zeigen: eine gezielte Diagnose-Änderung im Worker

Im `connect`-Catch (Zeile 763 in `docs/loxone-ws-worker/index.ts`) beim Fehlerpfad zusätzlich loggen: `host`, `err.response?.status`, `err.code`, `err.cause?.code`. Ein Log-Only-Patch, kein Backoff-Umbau — damit wir in der nächsten Fehlerwelle exakt sehen, wer den 408 sendet (axios vom Miniserver? vom Cloud-Relay? von Node selbst?).

## Was ich **nicht mehr** vorschlage

- **Kein** 423/503-Cool-down-Patch (falsche Ursachen-Hypothese, Beweislage widerlegt).
- **Keine** Close-Storm-Backoff-Änderung — der aktuelle Backoff arbeitet bereits im Cap.
- **Keine** Duplikat-Bereinigung (existiert nur eine aktive Integration für Rathaus, wie zuvor korrigiert).

## Meine Empfehlung

Schritt A ausführen, dann entscheiden. Ich rate nicht vor, was der Host in der Config ist — das prüfe ich mit einer DB-Query, sobald du grünes Licht gibst. Soll ich?
