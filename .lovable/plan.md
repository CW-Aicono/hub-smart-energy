## Ziel

**Zentraler Multi-Tenant-Worker auf Hetzner.** EIN Container bedient ALLE Mandanten und ALLE Gateways gleichzeitig — kein Setup-Aufwand mehr pro Liegenschaft, keine Hardware vor Ort nötig (Raspberry Pi nur noch optional für Test/Demo).

## Architektur

```
┌─────────────────────────────────────────┐
│  Hetzner-Server (CX22, ~5 €/Monat)      │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ gateway-worker-live (1 Container)│   │
│  │  → SUPABASE_SERVICE_ROLE_KEY    │    │
│  │  → Discovery-Loop alle 60s      │    │
│  │  → bedient ALLE Tenants         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ gateway-worker-staging          │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
            ↓ liest
┌─────────────────────────────────────────┐
│  Cloud-DB                               │
│   • location_integrations (alle Tenants)│
│   • integrations (Gateway-Typen)        │
│   • meters (Sensor-Mapping)             │
│   • config_encrypted (Credentials)      │
└─────────────────────────────────────────┘
            ↓ pollt parallel
   Loxone | Shelly | Tuya | ABB | Siemens
   Homematic | Omada | Home Assistant
            ↓ schreibt
   meter_power_readings (mit korrekter tenant_id)
```

## Stufe 1 — Worker-Code umbauen (Multi-Tenant)

**`docs/gateway-worker/index.ts` komplett neu strukturieren:**
- Auth: `SUPABASE_SERVICE_ROLE_KEY` (RLS-Bypass) statt einzelner Gateway-Keys
- Discovery-Loop alle 60s: lädt `location_integrations` + `integrations` + `meters` aller Tenants
- Treiber-Registry pro Gateway-Typ — portiert aus den bestehenden Edge Functions:
  - `loxone` (WebSocket), `shelly` (Cloud-Polling), `tuya`, `abb`, `siemens`,
    `homematic`, `omada`, `home_assistant`
- Credentials werden mit `BRIGHTHUB_ENCRYPTION_KEY` aus `config_encrypted` entschlüsselt
- Schreibt direkt in `meter_power_readings` mit `tenant_id` aus Gateway-Datensatz
- Heartbeat: alle 30s `system_settings.worker_last_heartbeat` setzen → bestehender Edge-Function-Fallback in `_shared/workerStatus.ts` greift unverändert
- `.env` reduziert auf 4 Variablen: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BRIGHTHUB_ENCRYPTION_KEY`, `WORKER_ENV`

## Stufe 2 — Hetzner-Setup (genau 2 Container)

- `gateway-worker-live` → Live-Cloud
- `gateway-worker-staging` → Staging-Cloud
- `docker-compose.yml` mit `restart: always`
- Healthcheck via `system_settings.worker_last_heartbeat` (extern: Uptime-Kuma / Healthchecks.io)

**Pro neuem Mandant / neuer Liegenschaft / neuem Gateway: NULL Server-Aktion.** Worker erkennt neue Geräte automatisch beim nächsten Discovery-Lauf.

## Stufe 3 — Übergang & Edge-Function-Reduktion

1. **Parallelbetrieb 1–2 Wochen**: Edge Functions schreiben weiter, Worker schreibt zusätzlich → Datenkonsistenz vergleichen
2. **Umschalten** über bereits existierendes `worker_active`-Flag in `system_settings` (Heartbeat-basiertes Fallback bleibt)
3. **Edge Functions reduzieren** auf:
   - `action: "test"` — Verbindungstest aus UI
   - `action: "getSensors"` — Discovery für UI-Wizards
   - `action: "executeCommand"` — Steuerbefehle
   - **Schreibpfad in `loxone-api`/`shelly-api` etc. komplett entfernen**
4. UI nutzt `meter_power_readings` (Realtime-Subscription) statt Edge-Function-Polling → Edge-Function-Kosten sinken massiv

## Sicherheit

- `SUPABASE_SERVICE_ROLE_KEY` liegt **ausschließlich** in `.env` auf Hetzner — niemals im Frontend, niemals in Git
- Hetzner-Server gehärtet: SSH-Key-only, UFW-Firewall, automatische Sicherheitsupdates (`unattended-upgrades`)
- Tenant-Isolation bleibt: jeder DB-Insert nutzt `tenant_id` aus Gateway-Datensatz
- Bei Server-Kompromittierung: Service-Role-Key in Cloud rotieren → alle Verbindungen sofort ungültig
- Gateway-Credentials (Loxone-User/Pass, Shelly-Token …) bleiben verschlüsselt in `location_integrations.config_encrypted`

## Vergleich

| Aspekt | Heute (1:1) | Neu (zentral) |
|---|---|---|
| Container bei 200 Mandanten | 200 | 2 (Live + Staging) |
| Aufwand neuer Mandant | ~30 Min Server-Setup | 0 — automatisch |
| Aufwand neues Gateway | Container neu starten | 0 — automatisch |
| Hardware vor Ort | Pi empfohlen | optional (nur Test/Demo) |
| Anleitung für Endnutzer | komplex | entfällt |
| Edge-Function-Aufrufe | hoch | minimal (nur UI) |

## Geschätzter Aufwand

- **Worker-Code-Umbau**: ca. 800–1200 Zeilen (Treiber-Portierung aus Edge Functions)
- **Hetzner-Deployment**: 2 Container statt N
- **Anleitung v7**: ca. 5 Seiten, Oma-tauglich, nur noch Cloud-Setup beschreiben (kein Pi-Pflicht-Pfad mehr)
- **Edge-Function-Cleanup**: ~50 Zeilen pro Gateway-Edge-Function entfernen

## Was dieser Plan NICHT macht

- Keine Migration alter Daten in `meter_power_readings`
- Keine Änderung am UI-Discovery-Pfad (Wizards funktionieren weiter)
- Pi-Worker bleibt funktionsfähig für Test-/Offline-Szenarien
