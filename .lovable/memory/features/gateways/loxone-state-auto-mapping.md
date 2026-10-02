---
name: Loxone State-Auto-Mapping (v1.11)
description: Worker klassifiziert unbekannte Loxone-States zur Laufzeit (fallend/negativ = pwr, monoton steigend = total); Gas/Wasser nie als Leistung
type: feature
---
Ab Worker v1.11 (`docs/loxone-ws-worker/index.ts`) werden **alle** States eines Loxone-Blocks in `uuidMap` aufgenommen. Unbekannte Namen erhalten `role: "aux"` und werden nicht gesendet, bis die Laufzeit-Heuristik `classifyAux()` entscheidet:

- Wert fällt einmal oder ist negativ → `pwr` (Live-Broadcast + 5-Min-Buckets)
- Wert steigt über ≥3 Samples monoton → `total`
- `energy_type` gas/wasser → **niemals** `pwr` (v1.9-Lehre: Zählerstand ≠ Leistung, sonst 660-kW-Spikes)
- Reine Status-States (locked, text, icon, error, mode …) werden per `IGNORED_STATE_RX` verworfen.

Diagnose in der Cloud (`bridge_event_log`, severity warn, damit sie persistiert wird):
- `ws_mapping_gap` beim Verbinden: Blöcke ohne erkannte Leistung inkl. vorhandener State-Namen
- `ws_automap_pwr`: erfolgreiche Auto-Zuordnung

Hintergrund: Vor v1.11 lieferten nur 20 von 65 Zählern WS-Live-Werte, der Rest lief über den 15-Min-HTTP-Pull (u. a. „Erzeugung" mit veralteten Werten). Anleitung: `docs/loxone-ws-worker/UPDATE-v1.11-auto-mapping.md`.
