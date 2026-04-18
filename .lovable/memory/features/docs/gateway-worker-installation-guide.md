---
name: gateway-worker-installation-guide
description: Word-Anleitung AICONO_Gateway_Worker_Installation.docx (aktuell v7) muss strikt laientauglich bleiben (keine Programmier-Begriffe wie scp/git/CLI ohne Erklärung). Ab v7: Multi-Tenant-Architektur — genau 2 Container (live+staging) auf Hetzner, kein Pi mehr nötig (nur optional Test/Demo), Auth via SUPABASE_SERVICE_ROLE_KEY + BRIGHTHUB_ENCRYPTION_KEY, automatisches Discovery aller Tenants/Gateways alle 60s.
type: feature
---

Anleitung **AICONO_Gateway_Worker_Installation.docx** muss laientauglich bleiben — Oma-tauglich, jeder Befehl mit Erklärung, keine ungeklärten Fachbegriffe (Glossar am Ende).

**Architektur ab v7 (Multi-Tenant):**
- Genau 2 Container auf Hetzner: `gateway-worker-live` + `gateway-worker-staging`
- Auth: `SUPABASE_SERVICE_ROLE_KEY` (RLS-Bypass), keine per-Tenant-API-Keys mehr
- Discovery-Loop alle 60s lädt `location_integrations` + `integrations` + `meters` aller Tenants
- Treiber pro Gateway-Typ: loxone, shelly, tuya, abb, siemens, homematic, omada, home_assistant
- Credentials werden mit `BRIGHTHUB_ENCRYPTION_KEY` aus `config_encrypted` entschlüsselt
- Heartbeat in `system_settings.worker_last_heartbeat` alle 30s
- Raspberry Pi: nur noch optional für Test/Demo/Offline-Resilienz, kein Standard-Setup mehr

**.env-Schema (v7) — nur 4 Pflichtvariablen:**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BRIGHTHUB_ENCRYPTION_KEY`, `WORKER_ENV` (live|staging)
- Keine `TENANT_ID`, keine `GATEWAY_API_KEY` mehr

**Versionshistorie der Anleitung:**
- v1–v5: Einfacher 1:1-Worker (Pi oder Hetzner pro Tenant)
- v6: Erweiterung um manuelles Key-Hinterlegen
- v7: Multi-Tenant-Umstellung, Hetzner-only-Standard, Pi optional
