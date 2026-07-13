## Kernerkenntnis der Recherche

Der SOC des Fronius-Battery-Bausteins **hat sehr wohl eine UUID im Loxone-Miniserver** — sie ist nur in der Config-Baumansicht nicht als eigener VI sichtbar, weil sie ein interner Analog-Ausgang (`InfoOnlyAnalog`, Format `%`) des Fronius-Plugin-Bausteins ist. Über die Loxone-REST-API `/data/LoxAPP3.json` **taucht sie als eigenes Control mit `uuidAction` auf** und kann automatisch identifiziert werden. Der Anwender muss also keine UUID händisch heraussuchen.

Quellen: Loxone "Communicating with the Miniserver" V17, Loxone Fronius-Plugin-Doku, Library-Template „Fronius Battery" (StateOfCharge_Relative als Input) — alle bestätigen, dass SOC ein Sub-Output des Bausteins ist.

## Umsetzung

### 1. Schema-Erweiterung `energy_storages` (Migration)

- `soc_sensor_uuid text` — automatisch befüllte SOC-UUID
- `power_meter_id uuid` (FK → `meters.id`, ON DELETE SET NULL) — verknüpft Speicher mit dem Leistungszähler des Battery-Nodes im Widget
- `soc_updated_at timestamptz`

### 2. Auto-Discovery in `loxone-api`

Neue Action `discoverBatterySoc` (bzw. Integration in bestehenden Sync):

- Lädt gecachte `LoxAPP3.json`.
- Durchsucht `controls` nach Kandidaten:
  - `type` in `["InfoOnlyAnalog", "Fronius", "Battery"]`
  - **oder** `details.format` enthält `%`
  - **und** Name/Room/Cat matched Regex `/soc|ladezustand|state.?of.?charge|batter|speicher/i`
- Zusätzliche Plausibilitätsprüfung: aktueller Wert via `/jdev/sps/io/{uuid}/all` liegt zwischen 0 und 100.
- Bei Match: `energy_storages.soc_sensor_uuid` schreiben, `location_id` = Location der Integration.
- Läuft im bestehenden `loxone-periodic-sync` alle 5 Min mit (idempotent).

### 3. Ingest-Pfad um Rolle `soc` erweitern

- **`list-loxone-ws-meters`**: liefert pro `energy_storages` mit `soc_sensor_uuid` einen virtuellen Eintrag `role_hint = "soc"` + `storage_id`.
- **Loxone-Worker** (`docs/loxone-ws-worker/index.ts`): neue `StateRole = "soc"`, kein LoxAPP3-Expand, direkt in `state.uuidMap` mit Rolle `soc`. Broadcast + Ingest-Payload enthalten `role: "soc"` und `storage_id`.
- **`gateway-ingest`** / **`bridge-aggregator`**: bei `role === "soc"` **kein** `meter_power_readings`-INSERT, sondern `UPDATE energy_storages SET current_soc_pct = value, soc_updated_at = now() WHERE id = storage_id`.

Fallback: für Miniserver, bei denen der Worker (WebSocket) nicht läuft, pollt `loxone-periodic-sync` den SOC per REST (`/jdev/sps/io/{uuid}`) mit und schreibt ihn direkt in `energy_storages`.

### 4. UI

- **Automatische Anlage**: für Locations mit erkannter SOC-UUID, aber ohne `energy_storages`-Datensatz, wird ein Datensatz automatisch angelegt (Name = „Speicher <Location>", `capacity_kwh` = 0 als Default).
- **Manuelle Nachjustierung**: bestehender Storage-Dialog erhält zusätzlich:
  - Dropdown „Leistungszähler" → `power_meter_id`
  - Anzeigefeld „SOC-Quelle (Loxone-UUID)" mit Copy-Button + Button „Neu erkennen" (ruft `discoverBatterySoc`).
  - Optional: Textfeld zum manuellen Override falls die Heuristik daneben liegt.

### 5. Widget `EnergyFlowMonitor`

- SOC-Query matched zuerst über `power_meter_id === node.meter_id`, dann Fallback über `location_id`.
- Zusätzlich Loxone-Broadcast-Channel (`loxone-live-{tenantId}`) auf `role === "soc"` hören, `socByMeter` lokal überschreiben → Sub-Sekunden-Update.
- Kachel zeigt „SOC: {n} %", Popover zeigt SOC-Balken + gespeicherte kWh (aus `current_soc_pct * capacity_kwh`).

### 6. Verifikation

1. Nach Deployment: für Rathaus wird `energy_storages`-Datensatz mit `soc_sensor_uuid` automatisch angelegt.
2. `bridge_raw_samples` enthält Werte um 100 für die neue UUID.
3. `energy_storages.current_soc_pct = 100`, `soc_updated_at` frisch.
4. Widget-Kachel zeigt „SOC: 100 %".

Falls die Heuristik in Schritt 2 nichts findet, gibt die Discovery-Funktion die 5 wahrscheinlichsten Kandidaten (Name + UUID + aktueller Wert) im Storage-Dialog als Auswahl-Liste zurück — der Nutzer wählt einen aus, ganz ohne UUID-Kopieren.

## Was du nach dem Deployment machen musst

Nichts. Der Sync erkennt den SOC automatisch. Sollte die Auto-Erkennung fehlschlagen, siehst du im Speicher-Dialog eine Auswahlliste mit den plausibelsten Loxone-Werten und wählst per Klick den richtigen aus.
