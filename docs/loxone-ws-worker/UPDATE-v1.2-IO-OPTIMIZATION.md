# Loxone-WS-Worker Update v1.2 – IO-Optimierung (60s Flush)

**Datum:** 17. Juli 2026
**Grund:** Die Lovable-Cloud-DB hat wieder 100 % Disk-IO-Budget gemeldet. Analyse (`pg_stat_statements`) zeigt: der Loxone-WS-Worker feuerte alle **5 s** einen INSERT-Batch in `bridge_raw_samples` → **167 000 Statements** und **808 s** Gesamt-Schreiblast pro pg_stat-Fenster. Der HA-Add-on-Flush wurde in v3.4.0 bereits von 5 s auf 60 s gehoben; der WS-Worker fehlte dabei.

## Was ändert sich?

| Einstellung | Vorher | Nachher | Wirkung |
| --- | --- | --- | --- |
| `FLUSH_INTERVAL_MS` Default | 5 000 | **60 000** | ~92 % weniger INSERT-Calls |
| Untergrenze (Clamp) | keine | **15 000** | schützt gegen versehentliches Zurückstellen |
| WebSocket → Miniserver | Push, Echtzeit | **unverändert** Push, Echtzeit |
| Realtime-Broadcast (Live-UI) | Echtzeit | **unverändert** Echtzeit |
| 5-Min-Aggregat | alle 5 Min | **unverändert** alle 5 Min |

**Keine Datenverluste:** Werte liegen zwischen zwei Flushes im RAM des Workers. Bei Aussetzern bis 60 s kein Verlust, längere Ausfälle deckt der bestehende Reconnect ab.

## Was muss der Anwender tun?

Auf dem Hetzner-Server als root:

```bash
cd /opt/aicono/aicono-ems       # ggf. dein Repo-Pfad
git fetch --all
git pull

cd docs/loxone-ws-worker
docker compose build worker
docker compose up -d worker
docker compose logs --tail=50 worker
```

Erwartete Log-Zeile beim Start:

```
FLUSH_INTERVAL_MS=60000  RELOAD_INTERVAL_MS=300000  BRIDGE_HEARTBEAT_MS=...
```

## Überschreiben per ENV (optional)

Wer explizit einen anderen Wert setzen will (z. B. für Debugging):

```yaml
environment:
  FLUSH_INTERVAL_MS: "30000"   # 30 s – Werte unter 15 s werden auf 15 s geclampt
```

## Erwartete Wirkung

- `bridge_raw_samples`-INSERTs: **−92 %**
- Disk-IO-Budget: sollte binnen 12–24 h deutlich fallen
- Live-Latenz Loxone-Werte in UI: **unverändert** (Broadcast läuft parallel zum DB-Insert)
- Historische Auflösung in `bridge_raw_samples`: 60 s statt 5 s (für 5-Min-Aggregat ohne Bedeutung)

## Zusatz: neuer DB-Index

Parallel wurde in der Cloud folgender Index angelegt (bereits ausgerollt, kein Handeln nötig):

```sql
CREATE INDEX idx_bridge_raw_samples_tenant_recv
  ON public.bridge_raw_samples (tenant_id, received_at DESC);
```

Er beschleunigt die Live-Panel-Reads (EnergyFlowMonitor, LiveValues) und senkt Query #6 (`ilike + tenant + received_at`) von 832 ms auf wenige Millisekunden.
