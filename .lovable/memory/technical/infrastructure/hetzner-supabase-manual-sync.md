---
name: hetzner-supabase-manual-sync
description: Auf der separaten Hetzner-Supabase (OCPP/Wallbox-Stack hinter cp.aicono.org) werden NUR neue Edge Functions, pg_cron-Jobs und Postgres-Trigger/-Funktionen NICHT automatisch synchronisiert. DB-Migrationen und Frontend laufen über bestehende Pipelines des Hetzner-Programmierers und müssen NICHT extra gemeldet werden.
type: preference
---

## Regel

Beim Hetzner-Programmierer einen Hinweis nur dann ausgeben, wenn auf der Hetzner-Supabase **eine der folgenden drei Sachen neu/geändert** ist:

1. **Neue oder geänderte Supabase Edge Function** im Charging-/OCPP-Bereich
   (z. B. `charge-point-auto-reboot`, `ocmf-finalize`, `dlm-scheduler`, `peak-shaving-*`, `ocpp-firmware-control`, `send-charging-group-invoices`).
2. **Neuer oder geänderter pg_cron-Job**.
3. **Neue oder geänderte Postgres-Funktion oder Trigger**, die nicht über eine normale Migration entstehen (z. B. `pg_net`-Aufrufe, Security-Definer-Funktionen, die in der Hetzner-Migration fehlen könnten).

## Was NICHT mehr gemeldet wird

- Reine **DB-Migrationen** (neue Tabellen, neue Spalten, neue RLS-Policies, neue Storage-Buckets). Die spielt der Hetzner-Programmierer ohnehin ein. Wenn sie fehlen, fällt das im Frontend sofort auf.
- Reine **Frontend-Änderungen** (UI, Hooks, Komponenten).
- Alles außerhalb des OCPP-/Charging-Stacks.

## Format des Hinweises

Kurz am Ende der Antwort, in Klartext:

> ⚠️ **Hetzner-Supabase**: Diese neue Edge Function / dieser Cron-Job ist auf Lovable-Cloud aktiv, muss aber von eurem Hetzner-Programmierer auf der selbst-gehosteten Supabase einmalig deployed/registriert werden. Anleitung siehe `docs/ocpp-persistent-server/`.

## Begründung

Frühere Hinweise (Mai/Juni 2026) waren zu breit und haben Tabellen/Spalten gemeldet, die längst auf Hetzner liefen. Das war falsch und hat den Kunden verunsichert. Edge Functions + Cron sind die einzigen Artefakte, die wirklich **pro Supabase-Instanz** manuell deployed werden müssen.
