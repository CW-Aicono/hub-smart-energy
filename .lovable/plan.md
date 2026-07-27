
## Rücknahme: Session-Kollision ist nicht die Ursache

Du hast recht — dieselben Credentials laufen seit Wochen parallel gegen Live und Staging. Wäre es ein reiner Session-Slot-Konflikt am Miniserver, hätte das seit dem ersten Tag geknallt. Meine bisherige Hypothese ist damit widerlegt. Ich nehme sie zurück und bleibe erstmal bei den bestätigten Fakten.

## Was ich jetzt sicher weiß (verifiziert)

- **Worker läuft**, `bridge_workers.hetzner-bridge-test` Version `phase7.5-auth-status`, Heartbeat aktuell.
- **`bridge_event_log` seit 25.07. 18:17 UTC — also seit ~2 Tagen — meldet zwei wiederkehrende Fehler**, obwohl Daten bis heute 10:20 UTC durchgekommen sind:
  - `Request failed with status code 408` → **1924×** (25.07. 18:17 – jetzt)
  - `Request failed with status code 405` → **8×** (25.07. 23:43 – heute 09:53)
  - leerer `reason` → 462×
- **`link_id` ist bei diesen Events NULL** — der Worker hat also noch nicht mal einen bestimmten Miniserver gepickt, wenn's fehlschlägt. Das passiert in der Bootstrap-/Setup-Phase eines Reconnect-Zyklus.
- **Beide Deployments nutzen `serial_number` → Loxone-Cloud-DNS-Relay** (`<serial>.dyndns.loxonecloud.com`). Die `loxone-api`-Edge-Function pollt gerade **live und erfolgreich** genau über dieses Relay (HTTP 200 in den Edge-Logs).
- **Datenausfall im Lovable-Backend**: Lücke in `meter_power_readings_5min` von 10:20 UTC bis 17:45 UTC — deckt sich exakt mit dem Fenster, in dem der Worker gar keine Events und keine `gateway-ingest`-Calls mehr abgesetzt hat (Prozess hing).

## Was das nahelegt (Hypothesen — noch nicht bewiesen)

1. **Der Worker schleppt seit 25.07. abends einen konstanten Fehlerpfad mit** (die 1924× 408) — vorher funktionierte er trotzdem, weil parallel gesunde WS-Sessions liefen. Heute morgen 10:20 UTC hat irgendein Zusatzereignis (kurzes Cloud-Auth-Hakler, Netzwerk-Blip, oder Token-Rotation) die letzte gesunde Session gekippt — und der Worker ist danach **nur noch im Fehler-Retry hängen geblieben**, ohne sauber neu aufzubauen. Das erklärt „wochenlang stabil" + „heute Totalausfall".
2. Der 408 selbst kommt aus einem axios-Call — muss aber nicht der Miniserver sein. Kandidaten:
   - Loxone-Cloud-Relay (`dns.loxonecloud.com`) bei der Adressauflösung des Miniservers
   - Ein Kontroll-HTTP-Call gegen den Miniserver, bevor der WS aufgebaut wird
   - Ein Cloud-seitiger Aufruf (`gateway-ingest`/`worker-killswitch`), der über einen Proxy 408 zurückliefert
3. Der zweite Tag war das Ereignis vom **25.07. 18:17 UTC** — dort begannen die 408. Wenn wir diesen Zeitpunkt zurückverfolgen (Deploy? Config-Änderung? Serverneustart Hetzner?), finden wir wahrscheinlich den echten Auslöser.

## Vorgehen — Diagnose vor Aktionismus

### Schritt 1: den 408-Aufruf eindeutig lokalisieren (kein Fix, nur Beweis)
- Im Worker-Code (`docs/loxone-ws-worker/index.ts` sowie das lxcommunicator-Wrapper-Modul) alle axios-Callsites markieren und schauen, welcher davon in der Bootstrap-Phase (vor `link_id`-Zuweisung) läuft.
- **Ein Feld `details.stage` im `logEvent`-Call ergänzen** ("dns-lookup" / "http-token" / "ws-upgrade" / "cloud-callback"), damit jeder zukünftige 408 sofort einen eindeutigen Ursprung hat. Diese Änderung ist minimal-invasiv, kostet nichts an IO und macht die nächste Wiederholung sofort auswertbar.

### Schritt 2: Ereignis am 25.07. 18:17 UTC nachvollziehen
- Git-Log des Repos `CW-Aicono/ha-addons` und Hetzner-Deployment-History um 25.07. 18:00 UTC checken (Deploy des Workers? Config-Update? Miniserver-Firmware-Update beim Kunden?).
- Falls keine Änderung: Netzwerk-/Provider-Vorfall Hetzner in dem Fenster prüfen.

### Schritt 3: Prozess-Hang von 10:23–17:48 UTC verstehen
- Der Worker hat 7 Stunden weder gelogged noch gepusht, aber sein Heartbeat war ebenfalls weg — nicht „silent alive", sondern echter Prozess-Freeze.
- Vermutet, aber unbestätigt: eine ungefangene Exception in einer Promise-Kette hat den Node-Event-Loop stillgelegt. Verifizierung: `journalctl -u <worker>` auf hetzner-staging-1 im Fenster 10:20 – 17:48 UTC lesen.

### Schritt 4: erst nachdem Schritt 1–3 Klartext geliefert haben, gezielt fixen
Kein blindes Umkonfigurieren, kein zweiter Miniserver-User „auf Verdacht". Wenn du willst, mach den zweiten User trotzdem an — nicht als Fix, sondern als Kontrollexperiment (dann wissen wir sicher, ob Credentials überhaupt eine Rolle spielen).

## Technische Notiz (für später)

Der Worker hat bereits einen Watchdog (`WATCHDOG_STALE_MS=30min`, Zeile 79 in `docs/loxone-ws-worker/index.ts`). Der hat heute offensichtlich nicht getriggert — d.h. entweder ist er beim Prozess-Freeze mit eingefroren, oder seine Trigger-Bedingung ist zu lax für genau diesen Zustand. Das ist ein zweiter Härtungspunkt, aber erst sinnvoll, wenn wir die Root-Cause kennen.

---

Sag mir, welchen Schritt du zuerst willst:
- **Schritt 1** (Stage-Marker im Worker-Log) — kleine Code-Änderung, macht die nächste Wiederholung sofort diagnostisch
- **Schritt 2** (Deploy-/Netzwerk-History 25.07.) — reine Recherche, keine Code-Änderung
- **Schritt 3** (journalctl auf hetzner-staging-1) — brauchst du oder dein Ops, ich habe keinen Zugriff darauf
