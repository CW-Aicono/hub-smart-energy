# Roadmap: Variante B in der Lovable-Umgebung schrittweise aufbauen

**Ausgangslage**

- Live-Umgebung (Hetzner) bleibt unverändert beim aktuellen Polling.
- Lovable-Umgebung bekommt parallel die neue Architektur.
- Bridge-Worker läuft auf der **bereits vorhandenen Hetzner-WebSocket-Testumgebung** (nicht in Supabase Edge Functions – die können keine dauerhaften Verbindungen halten).
- Zielbild: Miniserver → (WSS, Remote Connect) → Bridge-Worker → Supabase (Lovable).

**Leitprinzipien für diese Roadmap**

- Jeder Schritt liefert etwas Testbares und ist für sich alleine reversibel.
- Bestehende Tabellen/Funktionen bleiben unangetastet, bis der neue Pfad bewiesen ist.
- Wir bauen den Worker so, dass die früheren Stabilitätsprobleme (Reconnect, Keep-Alive, Token-Refresh) explizit adressiert werden – darauf liegt der Fokus, nicht auf Features.

---

## Phase 0 – Voraussetzungen klären (kein Code)

**Ziele**

- Festhalten, welcher Miniserver (Seriennummer, Firmware, Gen 1/2) als Test-Quelle dient.
- Klären, wie der Bridge-Worker den Miniserver erreicht: LAN-IP, Cloud-DNS (Portfreigabe) oder Remote Connect (Gen 2).
- Loxone-Benutzer **nur für den Worker** anlegen (eigener User, nur Leserechte, eigener WS-Slot – das macht spätere Debug-Sessions sauber).
- Liste der UUIDs festlegen, die der Worker abonnieren soll (nur die Zähler, die wir wirklich brauchen – nicht das gesamte Projekt).

**Deliverable**: Ein kurzes Konfig-Dokument (kein Code), das diese Werte sammelt.

---

## Phase 1 – DB-Schema in Supabase vorbereiten (Lovable)

Wir legen **neue, parallele Tabellen** an, damit der alte Polling-Pfad unberührt weiterläuft.

- `bridge_workers` – Registry der Bridge-Worker (id, name, last_heartbeat_at, status).
- `bridge_miniserver_links` – Verknüpfung Worker ↔ Miniserver ↔ tenant/location (Seriennummer, Verbindungsart, verschlüsselte Credentials, aktiv ja/nein).
- `bridge_event_log` – kleiner Ringpuffer (z.B. 7 Tage) für Verbindungs-/Auth-/Reconnect-Ereignisse. Damit beheben wir das Problem der letzten Runde, in der wir nicht sehen konnten, *warum* die Verbindung still wurde.

Schreiben in die **bestehenden** Aggregat-Tabellen (`meter_power_readings_5min`, `meter_cumulative_readings`) machen wir erst ab Phase 4 – und zuerst in eine "_staging"-Variante, damit wir vergleichen können.

**Deliverable**: Migration (zur Freigabe in Build-Mode), RLS-Policies, GRANTs.

---

## Phase 2 – Bridge-Worker Skelett auf Hetzner (Testumgebung) ✅ Code bereit

Eigenes kleines Node/TypeScript-Projekt (`ems-loxone-bridge`), Docker-Container, läuft als systemd/compose-Service neben der bestehenden WS-Testumgebung. **Noch keine** echte Loxone-Verbindung, nur:

1. **Heartbeat** an Supabase (alle 30 s) → `bridge_workers.last_heartbeat_at`.
2. **Config-Pull** aus Supabase (Liste der zu bedienenden Miniserver + UUIDs).
3. **Strukturierter JSON-Log** (stdout + optional in `bridge_event_log`).
4. **Healthcheck-HTTP-Endpoint** (`/healthz`, `/state`) – für späteres Monitoring.

**Test-Kriterium**: Worker läuft 24 h durch, Heartbeat ohne Lücken sichtbar in Supabase.

---

## Phase 3 – Loxone-WebSocket-Client (das eigentliche Stabilitäts-Thema)

Hier liegt der Kern der früheren Probleme. Wir adressieren sie explizit:

1. **Token-Auth** nach offiziellem Loxone-Protokoll (RSA-Session-Key → AES-CBC → `gettoken`), **kein** veraltetes Hash-Auth.
2. `**enablebinstatusupdate**` nach Auth + initiales Snapshot in den RAM laden.
3. **Keep-Alive**: alle 60 s `keepalive`-Frame; wenn keine Antwort in 90 s → Reconnect.
4. **Reconnect-Strategie** mit exponential backoff (1 s, 2 s, 5 s, … max 60 s) und Jitter.
5. **Token-Refresh** rechtzeitig **vor** Ablauf (Loxone-Tokens sind langlebig, aber nicht ewig – früher genau hier abgerissen).
6. **Schreibender Healthcheck**: jede Reconnect-/Auth-/Token-Aktion landet in `bridge_event_log` mit Grund.
7. **Watchdog**: wenn 5 Minuten kein einziges Event reinkommt, obwohl Verbindung "offen" → erzwungener Reconnect.

In dieser Phase werden Events **nur in den RAM** geschrieben und an `/state` ausgegeben – **noch nichts in Supabase**. So können wir die Verbindung Tage laufen lassen und stressen, ohne Datenmüll zu erzeugen.

**Test-Kriterium**: 72 h Dauerlauf, im `bridge_event_log` sind Reconnects sichtbar, aber es entsteht keine längere Datenlücke (> 2 Min) ohne Auto-Recovery.

---

## Phase 4 – Aggregation + Schreiben in Supabase (parallel zum Polling)

Erst jetzt schreibt der Worker Daten in die DB – und zwar in **Schatten-Tabellen** (`meter_power_readings_5min_bridge`, `meter_cumulative_readings_bridge`), damit wir 1:1 mit dem alten Polling-Pfad vergleichen können.

1. Pro Zähler werden alle eingehenden Events im RAM zu 5-Min-Buckets aggregiert (avg/min/max + Sample-Count).
2. Alle 5 Minuten ein Batch-Insert pro Zähler.
3. Zusätzlich alle 5 Min der aktuelle kWh-Zählerstand → Schatten-Tabelle der Cumulative Readings.
4. Idempotenz: `ON CONFLICT (meter_id, bucket_start) DO UPDATE`, damit Reconnect-Replays keine Duplikate erzeugen.
5. Kein Schreiben in die "echten" Tabellen – die Lovable-UI nutzt weiter den alten Pfad.

**Test-Kriterium**: 48 h Parallelbetrieb, Vergleichs-Query Schatten- vs. Echt-Tabelle zeigt Abweichungen < 1 % (und wo es abweicht, ist die Bridge in den meisten Fällen sogar genauer, weil polling-unabhängig).

---

## Phase 5 – Live-Werte-Endpoint + UI-Umschaltung "Aktuelle Werte"

1. Bridge-Worker bekommt einen `GET /live/:miniserver_serial` Endpoint, der den aktuellen RAM-State liefert.
2. Edge Function `bridge-live-proxy` in Supabase (dünner Proxy mit Auth + Tenant-Check) reicht die Anfrage an den Worker durch. So muss der Browser den Worker nicht direkt kennen und unsere RLS bleibt führend.
3. Seite **"Energiedaten → Aktuelle Werte"** bekommt einen Feature-Toggle (pro Tenant/Location), der zwischen "DB (alt)" und "Bridge (neu)" umschaltet. Default bleibt "alt".

**Test-Kriterium**: Toggle umstellen, Werte aktualisieren in < 2 s, kein zusätzlicher DB-Traffic.

---

## Phase 6 – Cut-over für Lovable-Umgebung

Erst wenn Phase 4 und 5 mindestens eine Woche stabil laufen:

1. Schatten-Tabellen werden zur Quelle der Wahrheit (Rename oder View-Switch).
2. Polling-Cron für die betroffenen Loxone-Locations in der Lovable-Umgebung wird **deaktiviert** (nicht gelöscht – Rollback in < 1 Min möglich).
3. `bridge_event_log` wird Monitoring-Quelle für ein neues Admin-Widget "Bridge-Status".

Hetzner-Live-Umgebung bleibt davon **komplett unberührt**.

---

## Phase 7 – Multi-Tenant-Ausbau (optional, später)

- Mehrere Miniserver pro Bridge-Worker (1 WSS-Verbindung pro Miniserver, gemeinsamer Prozess).
- Mehrere Bridge-Worker (für Lastverteilung / Geo-Redundanz), Konfig steuert, welcher Worker welchen Miniserver bedient.
- Übergang AICONO-Gateway: Bridge-Worker-Code und Gateway-Code teilen sich denselben Aggregations-/Schreib-Layer. Der "Worker" wandert dann einfach auf die Kunden-Hardware.

---

## Risiken & wie wir sie früh entschärfen


| Risiko                         | Maßnahme                                                              |
| ------------------------------ | --------------------------------------------------------------------- |
| WS bricht still ab (alter Bug) | Watchdog + `bridge_event_log` ab Phase 3, **bevor** wir DB schreiben  |
| Token läuft ab, keiner merkt's | Explizites Token-Refresh + Event-Log-Eintrag                          |
| Doppelte Werte (alt + neu)     | Schatten-Tabellen bis Cut-over                                        |
| Worker-Crash auf Hetzner       | systemd Restart + Healthcheck-Endpoint, Heartbeat-Alarm in Supabase   |
| Loxone-Limit 31 Clients        | Eigener Worker-User, dokumentiert; Monitoring sieht andere App-Logins |


---

## Was als Nächstes von dir gebraucht wird

Bevor wir Phase 1 (DB-Migration) in Build-Mode starten, brauche ich **drei** Festlegungen:

1. **Test-Miniserver**: Welcher genau? (Seriennummer, Gen 1/2, Firmware, Verbindungsweg LAN/Cloud-DNS/Remote Connect)
2. **Wo läuft der Bridge-Worker konkret?** Eigener Container auf der vorhandenen Hetzner-WS-Testumgebung – ok? Oder eine eigene kleine VM?
3. **Reichweite der Test-Locations** in der Lovable-Umgebung: 1 Location reicht für Phase 4/5 – welche soll es sein?

Sobald diese drei Punkte geklärt sind, schlage ich konkret die Migration für Phase 1 vor.  
  
1. Test-Miniserver: Bitte alle drei miniserver sofort umsetzen: Seriennummer: 504F94A2BAA2, Seriennummer: 504F94A22D9C, Seriennummer: 504F94D107EE, alle Miniserver sind Gen2. Alle Miniserver können Remote Connect nutzen, sind bereits so eingebunden.  
  
2. Der Bridge-Worker läuft auf Hetzner in einem eingenen Docker-Container. Es gibt Dokumentation dazu hier im Code.  
  
3. Wir nutzen den Tenant Stadt Steinfurt, dort sind auch alle Miniserver bereits in Betrieb.