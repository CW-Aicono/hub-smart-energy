# Analyse der Loxone Miniserver-Monitor-Zahlen

Keine Code-Änderungen ausgeführt — nur Analyse. Am Ende stehen drei optionale Folgeschritte zur Auswahl.

---

## 1. Was die Spalten **tatsächlich** anzeigen (aus `LoxoneMiniserverMonitorCard.tsx`)


| Spalte                 | Wirkliche Bedeutung                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Verbunden seit**     | Alter der **aktuellen** (neuesten) Session-Zeile (`started_at` der jüngsten Zeile). Bei AICONO Zentrale: 2026-06-20 17:01 UTC → ~20,5 h. |
| **Letzter Heartbeat**  | `now() − updated_at` der aktuellen Zeile. ~11 s = frisch.                                                                                |
| **Events (Sitzung)**   | **Nur die aktuelle Session**, nicht 24 h. Hartkodiert: `s?.events_received`.                                                             |
| **Reconnects 24 h**    | Summe von `reconnect_count` über **alle** Session-Zeilen im 24-h-Fenster (in-Session-Reconnects, kein Neuaufbau).                        |
| **Uptime 24 h**        | Summe aller (geclippten) Session-Intervalle ÷ 24 h.                                                                                      |
| **Sitzungen 24 h**     | Anzahl der DB-Zeilen in `loxone_ws_session_log` mit `started_at ≥ now-24h` **ODER** `ended_at IS NULL`.                                  |
| **Letzter Disconnect** | Zeigt `s.disconnect_reason`. Wenn aktuelle Session offen (`ended_at IS NULL`) → "—". Deshalb hier leer.                                  |


---

## 2. Warum "20 h verbunden" aber "200+ Sitzungen"?

Das ist **kein Verbindungs-Problem, sondern ein Daten-Bug im Worker**. Beweis aus `loxone_ws_session_log` für AICONO Zentrale:

```
started_at              updated_at              ended_at  events  reconnects
2026-06-20 17:01:44     2026-06-21 13:32:43     NULL      20      1     ← aktuelle Session
2026-06-20 16:58:25     2026-06-20 17:00:24     NULL      10      0     ← "tot", nie geschlossen
2026-06-20 16:52:39     2026-06-20 16:57:38     NULL      10      0     ← "tot"
2026-06-20 14:45:30     2026-06-20 16:51:28     NULL      10      0     ← "tot"
... 197 weitere Zeilen mit ended_at = NULL ...
```

**Alle 227 Zeilen haben `ended_at = NULL**`. Der Worker (`hetzner-prod-1`) legt bei jedem Neustart/Redeploy bzw. WS-Reconnect eine **neue** Zeile an, schreibt aber **nie `ended_at**` auf die vorherige. Das Komponenten-Filter `started_at ≥ 24h OR ended_at IS NULL` zählt jede dieser Leichen mit.

**Konsequenz für die UI:**

- "Sitzungen 24 h" ist im Moment ein **Zombie-Zeilen-Zähler**, kein echter Sitzungszähler.
- "Uptime 24 h = 100 %" stimmt trotzdem, weil sich die geclippten Intervalle aneinanderreihen.
- "Letzter Disconnect" bleibt leer, weil die aktuelle Session offen ist.

**Echte Reconnect-Dichte** (innerhalb derselben WS-Verbindung): 17/24 h ≈ alle 1,4 h ein in-Session-Reconnect. Das ist für Loxone-WS unauffällig, aber nicht null.

---

## 3. Logs

Server-/Worker-Logs (`hetzner-prod-1`) liegen außerhalb von Lovable Cloud — kann ich von hier nicht einsehen. Was ich in Cloud-Logs prüfen könnte:

- Edge-Function-Logs (falls Worker über Edge Functions kommuniziert)
- Postgres-Logs (Insert-Muster)

Wenn gewünscht, prüfe ich gezielt — Hinweis welche Funktion(en) involviert sind, hilft.

---

## 4. Stabilitätsbewertung

**Verbindung selbst: stabil.** Aktive Session läuft seit ~20 h, Heartbeat 11 s frisch, Uptime 100 %, nur 17 in-Session-Reconnects/Tag.

**Aber:** Die UI-Zahl "Sitzungen 24 h = 200+" suggeriert Instabilität, die es real nicht gibt — das ist ein **Logging-Bug**, kein Connectivity-Problem.

---

## 5. Vorschlag — drei mögliche Folgeschritte (eines auswählen)

**A) Worker-Fix** (Ursache beheben): Worker so anpassen, dass beim Anlegen einer neuen Session alle älteren offenen Zeilen derselben `location_integration_id` mit `ended_at = updated_at` geschlossen werden. Erfordert Zugriff auf den Worker-Code (HA-Addon / Hetzner-Repo, nicht Lovable).

**B) Monitor-Fix** (Symptom kaschieren): In `LoxoneMiniserverMonitorCard.tsx` "Sitzungen 24 h" anders zählen — nur Zeilen, deren `updated_at` im 24-h-Fenster wirklich gepflegt wurde, oder nur die jüngste pro Integration als "aktuelle" Session werten. Spaltenkopf "Events (Sitzung)" bleibt korrekt; ggf. Tooltip ergänzen.

**C) Einmal-Reparatur**: SQL-Migration, die alle Zombie-Zeilen mit `ended_at = updated_at` schließt — bereinigt die Historie, ohne die Ursache zu beheben.

Bitte gib an, welcher Schritt (oder welche Kombination) als Nächstes umgesetzt werden soll. Ohne Freigabe bleibt der Code unverändert.  
  
Antwort: A) und C). Dann haben wir die Ursache gefixt UND eine saubere Historie.