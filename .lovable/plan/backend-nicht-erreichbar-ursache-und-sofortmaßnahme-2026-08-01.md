# Backend nicht erreichbar – Ursache und Sofortmaßnahme

## Was ich gemessen habe (keine Vermutung)

- Die Datenbank selbst ist **gesund und praktisch im Leerlauf**: 15 Verbindungen, davon 2 aktiv, keine Langläufer, keine Locks. Es ist **keine Überlastung** und **kein IO-Problem**.
- Trotzdem beantwortet das vorgelagerte API-Gateway praktisch **jede** Anfrage mit **HTTP 522** (Verbindung zum Upstream läuft in einen Timeout) – betroffen sind `/rest/v1/*` **und** `POST /auth/v1/token`. Deshalb hängt der Login-Button auf „Laden…“.
- Die Auth-Logs sind komplett leer: Die Anmeldeanfragen erreichen den Auth-Dienst gar nicht erst.
- Der Verbindungs-Pooler meldet direkt „connection to database not available“.

Fazit: Datenbank läuft, aber die **Vermittlungsschicht davor (Gateway/Pooler/Auth-Dienst) hängt**. Das ist ein Infrastrukturzustand, kein Fehler im App-Code – Codeänderungen würden hier nichts bringen.

## Sofortmaßnahme

1. **Backend neu starten** (Gateway, Pooler und Auth-Dienst werden neu verbunden). Dauert wenige Minuten, in denen die App nicht erreichbar ist.
2. Danach Status prüfen, bis der Zustand wieder „gesund“ ist.
3. Verifizieren: eine echte Anfrage gegen `/rest/v1/` und `/auth/v1/health` – erwartet wird 200/401 statt 522.
4. Erst wenn das steht: Login im Browser real durchspielen (Playwright), damit ich nicht nur behaupte, dass es geht.

## Danach: Wiederholung eindämmen

Im Log fällt auf, dass externe Worker im Sekundentakt pollen (`bridge_workers` ca. alle 5 s, `loxone_pending_writes` alle 5 s, `pending_ocpp_commands` alle 20 s, dazu Statuspatches auf `charge_points`). Das ist nicht die Ursache des jetzigen Ausfalls, hält aber Gateway und Pooler dauerhaft unter Grundlast und verlängert jede Erholungsphase.

Vorschlag als Folgeschritt (nur nach deiner Freigabe, getrennt vom Notfall-Fix):
- Poll-Intervalle der Worker anheben bzw. auf Push/Realtime umstellen, wo möglich.
- Retry-Verhalten der Worker mit Backoff versehen, damit sie bei 5xx nicht unverändert weiterfeuern und die Erholung blockieren.

## Technische Details

- Beobachtung: `edge_logs` → durchgängig `status_code = 522` über alle Pfade; `auth_logs` leer.
- `pg_stat_activity`: keine aktiven Langläufer, kein Sättigungsbild.
- Der Metrik-Endpunkt des Projekts antwortet ebenfalls nicht (Timeout) – konsistent mit einem hängenden Gateway.
- Maßnahme: Backend-Neustart über das Cloud-Management (erfordert deine Zustimmung im Tool-Dialog).
