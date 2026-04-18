Du hast komplett recht — das aktuelle 1-Container-pro-Tenant-Modell skaliert nicht. Ich schlage vor, den Worker zu einem **zentralen Multi-Tenant-Worker** umzubauen, der alle Mandanten und alle Gateways aus einem einzigen Container heraus bedient.

## Konzept: Vom 1:1 zum 1:N

**Heute:**

```
Container A → 1 Tenant, 1 Gateway-Key
Container B → 1 Tenant, 1 Gateway-Key
... (skaliert linear mit jeder neuen Liegenschaft)
```

**Neu (zentral):**

```
EIN Worker auf Hetzner (Live)  +  EIN Worker auf Hetzner (Staging)
   ↓ liest alle 60s die Liste aktiver Gateways direkt aus der Cloud-DB
   ↓ verbindet parallel zu Loxone, Shelly Cloud, Tuya, ABB, Siemens, HA, Omada, Homematic
   ↓ schreibt Live-Daten direkt in `meter_power_readings` mit korrekter tenant_id
```

**Neuer Mandant / neue Liegenschaft / neues Gateway → null Server-Aktion.** Sobald in der Cloud-UI angelegt, wird das Gerät beim nächsten Discovery-Lauf automatisch mitgepollt.

## Was sich technisch ändert

### Worker-Code (`docs/gateway-worker/index.ts`)

- Authentifizierung: **Service-Role-Key** statt einzelner Gateway-Keys (RLS-Bypass, eine Identität für den ganzen Worker)
- Discovery-Loop: alle 60s `location_integrations` + `integrations` + `meters` laden, neue Gateways automatisch starten, gelöschte stoppen
- Treiber-Registry: ein Modul pro Gateway-Typ (loxone, shelly, tuya, abb, siemens, homematic, omada, home_assistant) — das meiste existiert bereits in den Edge Functions und wird nur portiert
- Credentials der Gateways bleiben verschlüsselt in `location_integrations.config_encrypted` → Worker entschlüsselt mit `BRIGHTHUB_ENCRYPTION_KEY`
- Heartbeat in `system_settings.worker_last_heartbeat` → bestehender Edge-Function-Fallback in `_shared/workerStatus.ts` greift unverändert

### Hetzner-Setup

- **Genau 2 Container** insgesamt:
  - `gateway-worker-live` → zeigt auf Live-Cloud
  - `gateway-worker-staging` → zeigt auf Staging-Cloud
- `.env` reduziert sich auf 4 Zeilen: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BRIGHTHUB_ENCRYPTION_KEY`, `WORKER_ENV`
- Keine `TENANT_ID`, keine `GATEWAY_API_KEY` mehr

### Raspberry Pi

- Wird zur **optionalen Vor-Ort-Hardware** für Standorte mit instabiler Internetverbindung (lokale Resilienz, Offline-Buffer)
- Standardfall ab jetzt: **kein Pi nötig**, Hetzner-Worker macht alles

## Vergleich


| Aspekt                      | Heute (1:1)           | Neu (zentral)      |
| --------------------------- | --------------------- | ------------------ |
| Container bei 200 Mandanten | 200                   | 2 (Live + Staging) |
| Aufwand neuer Mandant       | Server-Setup, ~30 Min | 0 — automatisch    |
| Aufwand neues Gateway       | Container neu starten | 0 — automatisch    |
| Hardware vor Ort            | Pi empfohlen          | optional           |
| Anleitung für Endnutzer     | komplex               | entfällt           |


## Sicherheit

- Service-Role-Key liegt **ausschließlich** im `.env` auf Hetzner, niemals im Frontend, niemals in Git
- Tenant-Isolation bleibt erhalten: jeder DB-Insert nutzt die korrekte `tenant_id` aus dem Gateway-Datensatz
- Bei kompromittiertem Worker-Server: Key in Cloud rotieren → alle alten Verbindungen sofort ungültig

## Migration & Rollout

1. **Worker-Code umbauen** (Multi-Tenant-Discovery + Treiber-Portierung) — größter Brocken, ca. 800–1200 Zeilen
2. **2 neue Container** auf bestehendem Hetzner-Server starten (Live + Staging)
3. **Parallelbetrieb 1–2 Wochen**: alte Edge-Function-Schreibpfade laufen weiter, neuer Worker schreibt zusätzlich → Datenkonsistenz vergleichen
4. **Umschalten** über bereits existierendes `worker_active`-Flag in `system_settings` (siehe Stufe 2 im aktuellen Plan)
5. **Alte 1:1-Container abbauen**, Pi-Geräte werden zu freiwilliger Vor-Ort-Hardware
6. **Anleitung v7** komplett neu, nur noch ~5 Seiten, Oma-tauglich, 2 Container statt N

## Bevor ich den Code-Umbau starte — eine Klärung

**Authentifizierung des zentralen Workers gegen die Cloud:**

- **Option A (empfohlen): Service-Role-Key.** Ein Schlüssel, RLS-Bypass, maximal einfach. Nachteil: voller DB-Zugriff bei Kompromittierung — daher Pflicht, dass der Hetzner-Server gehärtet ist (SSH-Key-Login, Firewall, automatische Updates).
- **Option B: Dedizierter `worker_master`-API-Key + neue Edge-Function.** Worker spricht nur über eine spezielle Edge Function mit der DB. Granularer, aber +1 Edge Function und etwas mehr Latenz.

Antwort: Bitte hier **Option A umsetzen.**