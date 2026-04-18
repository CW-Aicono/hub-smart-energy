---
name: gateway-worker-installation-guide
description: Word-Anleitung AICONO_Gateway_Worker_Installation.docx muss laientauglich bleiben. Ab v8: Multi-Tenant-Architektur, 2 Container (live+staging) auf Hetzner. Live-Worker zeigt auf self-hosted Supabase (Hetzner), Staging-Worker auf Lovable Cloud — Service-Role-Keys kommen aus zwei verschiedenen Quellen. Kein BRIGHTHUB_ENCRYPTION_KEY (der ist ausschließlich für die externe BrightHub-Integration, nicht für den Worker). Gateway-Credentials liegen in location_integrations.config (JSONB), nicht separat verschlüsselt. .env hat genau 3 Pflichtvariablen: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ENV.
type: feature
---

Anleitung **AICONO_Gateway_Worker_Installation.docx** muss laientauglich bleiben — Oma-tauglich, jeder Befehl mit Erklärung, Glossar am Ende.

**Architektur ab v8 (Multi-Tenant, getrennte Supabase-Instanzen):**
- Genau 2 Container auf Hetzner: `gateway-worker-live` + `gateway-worker-staging`
- **Live-Worker** → self-hosted Supabase auf Hetzner (eigene Domain)
- **Staging-Worker** → Lovable-Cloud-Supabase (`xnveugycurplszevdxtw.supabase.co`)
- Auth: `SUPABASE_SERVICE_ROLE_KEY` (RLS-Bypass) — aus zwei verschiedenen Quellen je Umgebung
- Discovery-Loop alle 60s lädt `location_integrations` + `integrations` + `meters`
- Treiber pro Gateway-Typ: loxone, shelly, tuya, abb, siemens, homematic, omada, home_assistant
- Gateway-Credentials liegen in `location_integrations.config` (JSONB Klartext, geschützt durch DB-at-rest-Encryption + RLS) — **keine** separate App-Layer-Entschlüsselung nötig
- Heartbeat in `system_settings.worker_last_heartbeat` alle 30s
- Raspberry Pi: nur noch optional für Test/Demo/Offline-Resilienz

**.env-Schema (v8) — nur 3 Pflichtvariablen:**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_ENV` (live|staging)
- **Kein `BRIGHTHUB_ENCRYPTION_KEY`** — der ist ausschließlich für die `brighthub_settings`-Tabelle (externer BrightHub-Datenaustausch via Edge Functions `brighthub-crypto`, `brighthub-sync`, `brighthub-periodic-sync`) und hat nichts mit dem Gateway-Worker zu tun

**Schlüsselquellen:**
| Variable | Staging | Live |
|---|---|---|
| SUPABASE_URL | Lovable Cloud Projekt-URL | eigene Hetzner-Supabase-Domain |
| SUPABASE_SERVICE_ROLE_KEY | Lovable → Cloud → Backend → API | self-hosted Supabase Studio → Settings → API, oder `SERVICE_ROLE_KEY` aus Supabase-`.env` |

**Versionshistorie der Anleitung:**
- v1–v5: Einfacher 1:1-Worker (Pi oder Hetzner pro Tenant)
- v6: Erweiterung um manuelles Key-Hinterlegen
- v7: Multi-Tenant-Umstellung (fälschlich BRIGHTHUB_ENCRYPTION_KEY für Worker erwähnt)
- v8: BRIGHTHUB_ENCRYPTION_KEY aus Worker-Setup entfernt; getrennte Supabase-Instanzen für Live (self-hosted) vs. Staging (Lovable Cloud) klar dokumentiert
