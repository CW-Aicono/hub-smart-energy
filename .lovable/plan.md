# Analyse: WebSocket-Primär, HTTP-Pull als Fallback

Recherche im Code (`loxone-api`, `loxone-ws-worker`, `_shared/workerStatus.ts`, `EditIntegrationDialog`) — hier die faktenbasierten Antworten. **Kein Code wird in diesem Turn geändert** — nur Analyse und Vorschlag.

---

## 1) Bleibt HTTP für andere Dinge aktiv? (Steuerbefehle etc.)

**Ja, HTTP bleibt zwingend nötig — der Worker macht *nur* Lesen.**

Was aktuell in `loxone-api` (HTTP) läuft und **nicht** vom WS-Worker abgedeckt wird:

- **Steuerbefehle** an Aktoren (`/jdev/sps/io/{uuid}/{cmd}`) — Automationen, manuelles Schalten, Pulse.
- **Strukturdatei** (`LoxAPP3.json`) laden → Discovery neuer Geräte, Räume, Kategorien.
- **Firmware-/Miniserver-Status** (Version, Uptime, Seriennummer).
- **Historische Statistikdateien** (`/stats/*.xml`) für Rückrechnung von Tages-/Monatswerten (Phase 4b in `loxone-api`).
- **SoC-Discovery** (Batteriespeicher-Kandidaten).
- **Kumulative Zählerstände** (`meter_cumulative_readings` — Periodensummen).

→ **HTTP-Pull kann niemals vollständig abgeschaltet werden**, nur die Frequenz reduziert.

---

## 2) Wo kommen 5-Min-Aggregate und Tagessummen her?

Heute existieren **beide Pfade parallel** und schreiben in dieselbe Tabelle `meter_power_readings_5min` (onConflict `meter_id,bucket,resolution_minutes`):


| Datentyp                                             | WS-Worker                                                         | HTTP-Pull (`loxone-api`)                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Live-Momentanwert (`meter_power_readings`)           | ✅ schreibt (jeder WS-Push)                                        | ⏭️ übersprungen wenn `worker_active` + Heartbeat frisch                                   |
| 5-Min-Aggregate (`meter_power_readings_5min`)        | ✅ Bucket-Aggregation → `bridge-power-5min` → `source='bridge_ws'` | ✅ nur als Fallback bei stalem WS (`source='loxone_pull'`) — siehe `loxone-api` L1848–1906 |
| Tages-/Perioden-Summen (`meter_cumulative_readings`) | ❌ macht Worker nicht                                              | ✅ nur HTTP-Pull                                                                           |
| Historische Backfill-Statistiken                     | ❌                                                                 | ✅ nur HTTP-Pull                                                                           |


→ **Tagessummen laufen ausschließlich über HTTP.** Der Worker liefert Live + 5-Min-Aggregate der letzten 5 Minuten.

---

## 3) Muss „Remote Connect WebSocket" in jeder Loxone-Integration aktiv sein?

**Ja, zwingend**, damit der Worker sich verbinden kann. Aktuell wird das Flag beim Erstellen einer Integration per Default auf `true` gesetzt (`EditIntegrationDialog.tsx:144`), lässt sich aber pro Integration wieder deaktivieren.

Konsequenz für Umbau: Wenn WS zum verlässlichen Primärpfad werden soll, muss die UI klarmachen, dass das Deaktivieren dieses Flags **Live-Daten komplett verliert** (nur noch 15-Min-Pull) — oder der Toggle ganz verschwinden.

---

## 4) Beeinflusst „Abfrage-Intervall (Minuten)" nur den HTTP-Pull?

**Ja.** Der Wert `poll_interval_minutes` steuert ausschließlich, wie oft `loxone-api` per HTTP zieht (Cron in Supabase). Der WebSocket-Worker läuft davon unabhängig und pusht kontinuierlich in Echtzeit, sobald der Miniserver ein Event sendet.

Bonus: Das Intervall bestimmt auch das Fallback-Fenster (`2 × poll_interval_minutes` — siehe `loxone-api` L1860): Wenn der WS-Worker so lange keinen 5-Min-Bucket geschrieben hat, springt der HTTP-Pull-Fallback ein.

---

## 5) Automatische Umschaltung WS ↔ HTTP möglich?

**Ist bereits implementiert — aber der Auto-Switch für Live-Daten (`meter_power_readings`) ist an den manuellen Kippschalter gekoppelt.**

Aktuelle Logik in `_shared/workerStatus.ts` → `isWorkerPrimary()`:

```
primary = worker_active_flag === true  AND  heartbeat < 5 min alt
```

- **Wenn primary = true** → `loxone-api` überspringt `meter_power_readings`-Insert (L1833–1845).
- **Wenn primary = false** (Flag aus **oder** Heartbeat stale) → `loxone-api` schreibt normal.

Zusätzlich existiert der **Pull-Fallback für 5-Min-Buckets** (L1848–1906), der **unabhängig vom Flag** greift: sobald der WS-Worker `> 2 × Intervall` keinen 5-Min-Bucket mehr gepusht hat, schreibt HTTP-Pull einen `loxone_pull`-Bucket. Sobald WS wieder liefert, überschreibt der WS-Upsert diesen wieder mit `bridge_ws`.

**Vorschlag zur Vereinfachung:** Den manuellen Schalter entfernen und `isWorkerPrimary()` **nur noch heartbeat-basiert** entscheiden lassen (Flag implizit immer an). Konsequenz: Sobald Worker frisch heartbeatet → HTTP schreibt keine Live-Werte. Sobald stale → HTTP übernimmt automatisch. Kein Admin-Eingriff nötig.

---

## 6) Erklärt paralleles Schreiben das IO-Budget / WAL-Wachstum?

**Teilweise ja — aber nicht das ganze Bild.**

Aktueller Zustand (Flag steht laut Screenshots auf **AUS**, weil Heartbeat oft grenzwertig war):

- WS-Worker schreibt Live-Werte **und** 5-Min-Buckets (`bridge_ws`).
- HTTP-Pull schreibt **zusätzlich** Live-Werte (weil `isWorkerPrimary()=false`) + Tagessummen + ggf. Fallback-5-Min-Buckets.
- → Für `meter_power_readings` haben wir aktuell **doppelte Insert-Last** von beiden Quellen.
- → Für `meter_power_readings_5min` konkurrieren gelegentliche `loxone_pull`-Upserts mit `bridge_ws`-Upserts (idempotent via onConflict, aber jeder Upsert erzeugt WAL).

WAL-Wachstum auf Hetzner (Self-hosted Supabase) kommt vor allem von:

1. `meter_power_readings` — hoher Insert-Durchsatz (jeder WS-Event = 1 Zeile pro Meter).
2. Wiederholte UPDATE/UPSERT auf `meter_power_readings_5min` und `meter_cumulative_readings`.
3. Vermutlich ungenügend aggressives `wal_keep_size` / Replikations-Slot-Retention.

**Sofort messbarer Gewinn durch WS-primär + HTTP-Fallback:**

- Live-Inserts halbieren sich (nur eine Quelle statt zwei).
- `loxone-api` läuft seltener bzw. macht weniger pro Lauf → weniger Edge-Function-Overhead und weniger konkurrierende Transaktionen.

**Nicht durch diesen Umbau lösbar** (separate Themen):

- Tagessummen-Writes (nur HTTP kann sie liefern).
- WAL-Retention/Checkpoint-Tuning auf Hetzner.

---

## Empfohlener Umbau (zur Diskussion, nicht zur sofortigen Umsetzung)

**Ziel:** WebSocket = default primäre Live-Quelle, HTTP = Fallback + Pflicht für Struktur/Steuerung/Tagessummen.

1. `**isWorkerPrimary()` vereinfachen:** manuellen `worker_active` Kippschalter entfernen, nur noch Heartbeat-Frische entscheidet.
2. **Stale-Schwelle konservativ setzen** (300–360 s, entspricht 5–6 Heartbeats mit 60 s Intervall).
3. **UI im Super-Admin:** Kippschalter durch reine Anzeige ersetzen („Live-Quelle: WebSocket-Worker / HTTP-Pull (Fallback)").
4. `**EditIntegrationDialog`:** Warnhinweis wenn User „Remote Connect WebSocket" deaktivieren will (Live-Daten gehen verloren, nur noch 15-Min-Pull).
5. **HTTP-Pull-Frequenz bei aktivem Worker** ggf. auf 30 Min hochsetzen (Tagessummen + Discovery brauchen nicht alle 15 Min).
6. **Metriken sammeln** vor/nach: Inserts/Min auf `meter_power_readings`, WAL-Rate, Disk-IO — um den Gewinn zu belegen.

---

## Deine Entscheidung

Bitte bestätigen oder anpassen, welche Punkte umgesetzt werden sollen — dann erstelle ich einen konkreten Umsetzungsplan mit Migration/Code-Änderungen:

- (a) Kippschalter entfernen + rein heartbeat-basierter Auto-Switch?
- (b) Warnhinweis bei „Remote Connect WS deaktivieren"?
- (c) HTTP-Pull-Default von 15 auf 30 Min anheben (wenn WS läuft)?
- (d) Vorher/Nachher-Messung dokumentieren (Dashboard-Karte oder einmalige Auswertung)?  
  
Antworten:  
(a): erstmal überspringen, dazu habe ich noch Fragen  
(b): Ja  
(c): ja, wenn ws läuft dann 30 Minuten, ansonsten das im Feld hinterlegte Intervall (z. B. 15 Minuten)  
(d): erstmal überspringen, später zusammen mit (a)