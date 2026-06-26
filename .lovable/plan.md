# Plan: Erweiterung Aufgabenverwaltung

Zwei Funktionsbereiche werden ergänzt:
**A) Automatisches Aufräumen** (Auto-Archivieren nach 7 Tagen, Auto-Löschen nach 90 Tagen, pro Tenant überschreibbar)
**B) Wiederkehrende Aufgaben, Vorlagen und Checklisten**

---

## A) Auto-Archivieren & Auto-Löschen

### Verhalten
- "Archivieren" = Aufgabe verschwindet aus dem aktiven Tab, bleibt aber im Archiv-Tab sichtbar.
  Heute zählt jede `done`/`cancelled` Aufgabe sofort als archiviert. Neu: erst nach Ablauf der Archiv-Frist wird ein Flag `archived_at` gesetzt; vorher bleiben erledigte Aufgaben kurz im aktiven Tab (mit grünem "Erledigt"-Badge), damit nichts zu schnell verschwindet.
- "Löschen" = harte Löschung aus der DB nach Ablauf der Lösch-Frist.
- **Schutzregeln** (werden NICHT gelöscht/archiviert): Aufgaben mit `external_contact_name` (Kundenkommunikation) und Aufgaben mit aktiven Anhängen werden nur archiviert, nicht gelöscht.

### Einstellungen (pro Tenant)
Neue Sektion in **Einstellungen → Aufgaben** mit:
- Auto-Archivieren nach **X Tagen** (Default 7, 0 = deaktiviert)
- Auto-Löschen nach **Y Tagen** (Default 90, 0 = deaktiviert)
- Toggle "Externe Aufgaben nie löschen" (Default an)

### Technik
- Migration: Spalten `tasks.archived_at timestamptz` und `tenants.task_auto_archive_days int default 7`, `tenants.task_auto_delete_days int default 90`, `tenants.task_protect_external bool default true`.
- Edge-Function `task-cleanup` (täglich per `pg_cron`, 03:15 Europe/Berlin):
  1. Setzt `archived_at = now()` bei Aufgaben mit `status in ('done','cancelled')` und `updated_at < now() - X days` und `archived_at IS NULL`.
  2. Löscht Aufgaben mit `archived_at < now() - Y days` (unter Beachtung der Schutzregel).
  3. Schreibt Lauf-Log nach `task_history` (action `auto_archive` / `auto_delete`).
- Tasks-Seite: aktiver Tab filtert künftig `archived_at IS NULL` statt nur `status`.

---

## B) Wiederkehrende Aufgaben, Vorlagen, Checklisten

### Recurring Tasks
- Neue Spalten in `tasks`: `recurrence_rule text` (RRULE-Subset: daily/weekly/monthly + Intervall + optional Wochentag), `recurrence_parent_id uuid`, `next_due_at timestamptz`.
- Wenn eine wiederkehrende Aufgabe auf `done` gesetzt wird, erzeugt eine DB-Trigger-Funktion automatisch die nächste Instanz mit neuem `due_date` gemäß Regel.
- UI im **CreateTaskDialog**: neuer Abschnitt "Wiederholung" mit Auswahl Keine / Täglich / Wöchentlich / Monatlich + Intervall. Anzeige im TaskCard mit Wiederhol-Icon.

### Vorlagen
- Neue Tabelle `task_templates` (tenant-scoped, RLS): `title`, `description`, `priority`, `default_due_offset_days`, `recurrence_rule`, `checklist jsonb`.
- Neue Einstellungsseite **Aufgaben → Vorlagen** zum CRUD.
- Im CreateTaskDialog Dropdown "Aus Vorlage erstellen" oben — füllt Felder vor.
- Seed-Vorlagen (Migration): "Wartung Wallbox (jährlich)", "PV-Inspektion (jährlich)", "Zählerstand ablesen (monatlich)".

### Checklisten / Subtasks
- Neue Spalte `tasks.checklist jsonb` (`[{id, text, done}]`).
- Im **TaskDetailSheet**: Checklisten-Bereich mit Add/Toggle/Delete, Fortschrittsbalken (z. B. "3/5"). Anzeige des Fortschritts auch im TaskCard.
- Eine Aufgabe gilt nicht automatisch als erledigt, wenn alle Häkchen gesetzt sind — der User entscheidet weiterhin manuell.

---

## Technische Details

**Migrationen** (eine Migration, in dieser Reihenfolge):
1. `ALTER TABLE tasks ADD COLUMN archived_at`, `recurrence_rule`, `recurrence_parent_id`, `next_due_at`, `checklist`.
2. `ALTER TABLE tenants ADD COLUMN task_auto_archive_days`, `task_auto_delete_days`, `task_protect_external`.
3. `CREATE TABLE task_templates (...)` + GRANT + RLS (`tenant_id = current tenant`).
4. Trigger-Funktion `tasks_handle_recurrence_on_done()` + Trigger `AFTER UPDATE OF status ON tasks`.
5. Seed-Vorlagen via `INSERT ... SELECT FROM tenants` (über Insert-Tool nach Migration).

**Edge Function**
- `supabase/functions/task-cleanup/index.ts` (verify_jwt false, validiert Service-Role-Header), liest Tenant-Settings, läuft pro Tenant.
- `pg_cron` Eintrag täglich 03:15 Europe/Berlin.

**Frontend**
- `src/pages/Tasks.tsx`: Filter auf `archived_at IS NULL` umstellen.
- `src/components/tasks/CreateTaskDialog.tsx`: Vorlagen-Dropdown + Wiederholungs-Block + Checklisten-Editor.
- `src/components/tasks/TaskDetailSheet.tsx`: Checklisten-Bereich + Wiederholungs-Anzeige.
- `src/components/tasks/TaskCard.tsx`: Fortschritts-Indikator + Wiederhol-Icon.
- Neue Seite `src/pages/settings/TaskSettings.tsx` (Cleanup-Defaults + Vorlagen-Verwaltung), Eintrag im Settings-Menü.
- `src/hooks/useTasks.ts` / neuer `useTaskTemplates.ts`.

**Tests**
- Vitest für Recurrence-Berechnung (next_due_at), Checklist-Reducer, Cleanup-Filterregeln.

---

## Reihenfolge der Umsetzung
1. Migration (Spalten, Tabelle, Trigger) + GRANT/RLS.
2. Settings-Seite (Cleanup-Defaults).
3. Edge-Function `task-cleanup` + pg_cron.
4. UI: archived_at-Filter, Checklisten, Recurrence im Dialog, TaskCard-Anpassung.
5. Vorlagen-Verwaltung + Seed.
6. Tests + Dokumentation in `docs/`.

## Nicht enthalten (bewusst weggelassen — können später nachgezogen werden)
Erinnerungs-E-Mails, Eskalation, Assignees, Kommentare, Kanban-/Kalender-Ansicht, CSV-Export, KPIs.
