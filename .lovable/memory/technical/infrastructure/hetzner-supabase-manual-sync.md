---
name: hetzner-supabase-manual-sync
description: Die LIVE-Umgebung von AICONO läuft vollständig auf Hetzner inklusive eigener Supabase-Datenbank. Lovable Cloud/Preview ist nicht die Live-Datenquelle. Für Hetzner gelten separate Deploy-/Sync-Regeln.
type: preference
---

## Regel

**Harte Grundregel:** Die AICONO-**Live-Umgebung** läuft komplett auf **Hetzner**, inklusive **eigener Supabase-Datenbank**. Lovable Cloud/Preview darf bei Live-Problemen nicht als Quelle der Wahrheit behandelt oder mit Hetzner-Live gleichgesetzt werden.

Bei Live-Fehlern immer zuerst klären/prüfen, ob der betroffene Wert aus der Hetzner-Umgebung kommt. Lovable-Backend-Daten/Logs sind nur für Preview/Cloud relevant, außer es geht ausdrücklich um die Lovable-Umgebung.

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
