---
name: hetzner-supabase-manual-sync
description: Hetzner-Supabase (separate self-hosted Instanz für OCPP-Stack cp.aicono.org) wird NICHT automatisch von Lovable/GitHub synchronisiert. Bei jeder Migration/Edge Function/Cron, die OCPP betrifft, MUSS dem User explizit gesagt werden, dass ein manueller Nachzug auf Hetzner nötig ist.
type: preference
---

## Regel

Bei jeder Änderung, die auf der Lovable-Cloud-Supabase landet und auch auf der separaten **Hetzner-Supabase** (OCPP/Wallbox-Stack hinter `cp.aicono.org`) gebraucht wird, im Antworttext **explizit hinweisen**: „⚠️ Manueller Nachzug auf Hetzner-Supabase nötig".

## Wann gilt das

- Neue/geänderte **DB-Migration** (`supabase/migrations/...`) die Tabellen betrifft, die der OCPP-Server liest/schreibt: `charge_points`, `charge_point_connectors`, `charge_point_groups`, `charge_point_economics`, `charging_sessions`, `charging_tariffs`, `charging_users`, `charging_user_rfid_tags`, `charging_user_groups`, `charging_invoices`, `charging_billing_groups*`, `charging_session_meter_records`, `pending_ocpp_commands`, `ocpp_meter_samples`, `ocpp_message_log`, `roaming_*`, `cp_firmware_*`, `peak_shaving_*`, `location_dlm_config`, `dlm_control_log`, `grid_operator_connections`, `grid_curtailment_events`.
- Neue/geänderte **Edge Function** im Charging-Bereich: `charge-point-auto-reboot`, `ocpp-central`, `ocpp-persistent-api`, `ocpp-firmware-control`, `ocmf-*`, `public-ocmf-download`, `public-charge-status`, `dlm-*`, `peak-shaving-*`, `send-charging-invoices`, `send-charging-group-invoices`, `solar-charging-scheduler`, `cheap-charging-scheduler`, `wallbox-template-control`.
- Neue/geänderte **pg_cron-Jobs**, Postgres-Funktionen oder Trigger, die o.g. Tabellen anfassen.

## Wann gilt das NICHT

- Reine Frontend-Änderungen.
- Tenant-Dashboard, Gateways (Loxone/Shelly/Schneider/Siemens), PV-Forecast, Energy-Sharing, Tasks, Reports, Branding, Sales etc. — alles, was nicht zum OCPP-Stack gehört.

## Format des Hinweises

Kurz am Ende der Antwort, z. B.:

> ⚠️ **Hetzner-Supabase**: Diese Migration/Edge Function ist auf Lovable-Cloud aktiv, muss aber von eurem Hetzner-Programmierer auf der selbst-gehosteten Supabase nachgezogen werden (Tabelle X / Edge Function Y / Cron Z). Anleitung siehe `docs/ocpp-persistent-server/`.
