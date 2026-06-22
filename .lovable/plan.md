## Antworten auf deine zwei Fragen

### Frage 1: Warum steht im Worker-Feld `8d621355a384` statt `hetzner-prod-1`?

**Kurz:** Das ist nicht der Worker-Name, sondern der **Hostname** des Docker-Containers. Die UI zeigt absichtlich den Host, nicht den Namen, damit man bei mehreren parallelen Workern sieht, welcher physische Container die Sitzung hält.

**Im Detail:**
Der Worker kennt zwei verschiedene Variablen:

- `BRIDGE_WORKER_NAME` → Logischer Name (Standard: `hetzner-bridge-test`). Wird in der Tabelle `bridge_workers` als ID verwendet.
- `WORKER_HOST` → Hostname (Standard: automatisch von Docker vergeben, deshalb `8d621355a384`). Wird in jeder WS-Sitzung im Feld `worker_host` mitgeschrieben.

Die Anzeige im Monitor und auf der Integrationskarte zeigt `worker_host`. In deiner **Lovable-Testumgebung** hast du beim Start der Test-Bridge offenbar `WORKER_HOST=hetzner-prod-1` gesetzt — deshalb steht dort dieser sprechende Name. In **Live auf Hetzner** hast du `WORKER_HOST` nicht gesetzt, also nimmt der Container automatisch seine ID.

**Wenn du auch live einen sprechenden Namen möchtest** (z. B. `hetzner-prod-1`), kannst du das in einem späteren Schritt machen. Wichtig: rein kosmetisch, beeinflusst die Funktion null. Falls du das willst, sag Bescheid — dann gebe ich dir die genauen Putty-Befehle (eine zusätzliche `-e WORKER_HOST=hetzner-prod-1`-Zeile im Docker-Run-Befehl plus einmal Container neu starten).

---

### Frage 2: Bekommt das Backend die Live-Daten jetzt ausschließlich per WebSocket?

**Ja — solange die WebSocket-Sitzung aktiv ist (Status grün "Aktiv" im Monitor), läuft die gesamte Live-Datenübertragung über den WebSocket.** Konkret:


| Datenpfad                                                     | Verwendung                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WebSocket** (Loxone → Worker → `bridge-readings` → DB)      | Live-Werte aller Loxone-Zähler/Sensoren. Push-basiert, kommt im Sekundenbereich an. **Das ist der Standard, sobald "WebSocket aktiv" angezeigt wird.**                                                                             |
| **HTTP-Periodic-Sync** (`loxone-periodic-sync` Edge Function) | Läuft als geplanter Hintergrundjob (Cron) und holt sich per HTTP **Tageswerte / Zählerstände** vom Miniserver. Dient als Konsistenzcheck und für historische Korrekturwerte. Nicht WS-Fallback im engeren Sinn, sondern ergänzend. |
| **HTTP-Direktabfragen** (`loxone-api` Edge Function)          | Wird benutzt für Einzelaktionen wie "Firmware prüfen", "Befehl senden" usw. — nicht für Live-Datenstrom.                                                                                                                           |


**Echter Fallback bei WS-Ausfall:** Wenn der WebSocket abreißt (z. B. Internet weg), versucht der Worker automatisch alle paar Sekunden, neu zu verbinden (Reconnect-Zähler im Monitor). Während dieser Zeit fehlen die Live-Werte; sie werden **nicht** über HTTP nachgeholt — die Lücke bleibt eine Lücke, aber die Tageswerte (Zählerstände) gleicht der nächste Periodic-Sync wieder aus.

**Zusammengefasst:**

- Live-Strom (Sekunden-/Minutenwerte): **nur WebSocket**.
- Zählerstände / Tagessummen / Konsistenz: zusätzlich per HTTP-Cron.
- Steuerbefehle: per HTTP-Direktaufruf.
- HTTP ist **kein Live-Fallback**, sondern ein ergänzender Kanal für andere Zwecke.

---

### Was als Nächstes?

Ich schlage **keinen Code-Change** vor. Wenn du den Worker-Host in der Anzeige umbenennen willst, sag einfach "ja, bitte umbenennen auf hetzner-prod-1" — dann liefere ich die Putty-Schritte. Ansonsten ist alles wie gewünscht in Betrieb.  
  
Antwort: ja, bitte umbenennen auf hetzner-prod-1